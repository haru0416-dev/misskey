/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { formatDateTimeForFileName } from '@/misc/format-date-time.js';
import mime from 'mime-types';
import { ZipArchiveReader } from 'slacc';
import {
	deleteEmojiByNameAndHostFromDatabase,
	listLocalEmojisOrderedByIdFromDatabase,
} from '@/core/emoji/emoji-store.js';
import { fetchDriveFileByIdFromDatabase, fetchDriveFileByUrlFromDatabase } from '@/core/drive/drive-file-store.js';
import { fetchUserByIdFromDatabase } from '@/core/user/user-store.js';
import { createTemp, createTempDir } from '@/misc/create-temp.js';
import { writeZip } from '@/misc/zip-writer.js';
import type { ZipEntry } from '@/misc/zip-writer.js';
import { readDriveFileBuffer, withDriveFileContent } from '@/core/drive/drive-file-content.js';
import type { DriveFileContentDependencies } from '@/core/drive/drive-file-content.js';
import type { DownloadService } from '@/core/net/download-service.js';
import type { DbJobDataWithUser, DbUserImportJobData } from '@/core/queue/types.js';
import { addDriveFile } from '@/server/rest/drive/drive-file-upload.js';
import type { DriveFileUploadDependencies } from '@/server/rest/drive/drive-file-upload.js';
import { addCustomEmoji } from '@/server/rest/emoji/emojis.js';
import type { EmojiDependencies } from '@/server/rest/emoji/emojis.js';
import { createExportCompletedNotification } from '@/core/notification/notification.js';
import type { NotificationDependencies } from '@/core/notification/notification.js';

export type QueueEmojisDependencies = DriveFileUploadDependencies &
	DriveFileContentDependencies &
	EmojiDependencies &
	NotificationDependencies & {
		downloadService: Pick<DownloadService, 'downloadUrl'>;
	};

function writeToFile(stream: fs.WriteStream, content: string): Promise<void> {
	return new Promise<void>((res, rej) => {
		stream.write(content, (err) => {
			if (err) {
				rej(err);
			} else {
				res();
			}
		});
	});
}

async function* directoryEntries(dir: string): AsyncGenerator<ZipEntry> {
	for (const name of (await fs.promises.readdir(dir)).sort()) {
		const filePath = dir + '/' + name;
		const stats = await fs.promises.stat(filePath);
		if (!stats.isFile()) {
			continue;
		}
		yield { name, data: await fs.promises.readFile(filePath), modifiedAt: stats.mtime };
	}
}

export async function handleQueueExportCustomEmojis(
	deps: QueueEmojisDependencies,
	data: DbJobDataWithUser,
): Promise<void> {
	const user = await fetchUserByIdFromDatabase(deps.db, data.user.id);
	if (user == null) {
		return;
	}

	const [path, cleanup] = await createTempDir();

	const metaPath = path + '/meta.json';
	fs.writeFileSync(metaPath, '', 'utf-8');
	const metaStream = fs.createWriteStream(metaPath, { flags: 'a' });

	await writeToFile(
		metaStream,
		`{"metaVersion":2,"host":"${deps.config.runtime.host}","exportedAt":"${new Date().toString()}","emojis":[`,
	);

	const customEmojis = await listLocalEmojisOrderedByIdFromDatabase(deps.db);

	for (const [index, emoji] of customEmojis.entries()) {
		if (!/^[a-zA-Z0-9_]+$/.test(emoji.name)) {
			continue;
		}
		const ext = mime.extension(emoji.type ?? 'image/png');
		const fileName = emoji.name + (ext ? '.' + ext : '');
		const emojiPath = path + '/' + fileName;
		fs.writeFileSync(emojiPath, '', 'binary');
		let downloaded = false;

		try {
			// ドライブの原本が見つかる場合は保存場所からコピーし、自インスタンスへの HTTP 取得を避ける。
			const driveFile = await fetchDriveFileByUrlFromDatabase(deps.db, emoji.originalUrl);
			if (driveFile != null && driveFile.url === emoji.originalUrl) {
				await withDriveFileContent(deps, driveFile, (source) => fs.promises.copyFile(source, emojiPath));
			} else {
				await deps.downloadService.downloadUrl(emoji.originalUrl, emojiPath);
			}
			downloaded = true;
		} catch {
			// ファイル取得に失敗した絵文字も downloaded:false で記録し、処理を継続する。
		}

		if (!downloaded) {
			fs.unlinkSync(emojiPath);
		}

		const content = JSON.stringify({
			fileName,
			downloaded,
			emoji,
		});
		await writeToFile(metaStream, index === 0 ? content : ',\n' + content);
	}

	await writeToFile(metaStream, ']}');
	// アーカイブ作成前に meta.json の書き込み完了を待つ。
	await new Promise<void>((resolve, reject) => {
		metaStream.on('error', reject);
		metaStream.end(resolve);
	});

	const [archivePath, archiveCleanup] = await createTemp();
	try {
		await writeZip(archivePath, directoryEntries(path));
		const fileName = 'custom-emojis-' + formatDateTimeForFileName(new Date()) + '.zip';
		const driveFile = await addDriveFile(deps, { user, path: archivePath, name: fileName, force: true });

		createExportCompletedNotification(deps, user.id, 'customEmoji', driveFile.id);
	} finally {
		cleanup();
		archiveCleanup();
	}
}

type ExportedEmojiMetaRecord = {
	downloaded: boolean;
	fileName: string;
	emoji: {
		name: string;
		category: string | null;
		aliases: string[];
		license: string | null;
		isSensitive: boolean;
		localOnly: boolean;
	};
};

const MAX_EMOJI_IMPORT_META_BYTES = 16 * 1024 * 1024;
const MAX_EMOJI_IMPORT_FILE_BYTES = 32 * 1024 * 1024;

export async function handleQueueImportCustomEmojis(
	deps: QueueEmojisDependencies,
	data: DbUserImportJobData,
): Promise<void> {
	const file = await fetchDriveFileByIdFromDatabase(deps.db, data.fileId);
	if (file == null) {
		return;
	}

	const archive = await readDriveFileBuffer(deps, file);
	const [path, cleanup] = await createTempDir();

	try {
		// zip はディスクへ展開せず、meta.json と meta.json が指すエントリだけを名前で引いて読む。
		// symlink・ディレクトリ・暗号化エントリと上限超えは slacc 側で例外になる。
		const zip = ZipArchiveReader.fromBuffer(archive);
		const metaRaw = zip.readFile('meta.json', MAX_EMOJI_IMPORT_META_BYTES);
		if (metaRaw == null) {
			throw new Error('meta.json not found in the emoji archive');
		}
		const meta = JSON.parse(metaRaw.toString('utf-8')) as { emojis: ExportedEmojiMetaRecord[] };

		for (const [index, record] of meta.emojis.entries()) {
			if (!record.downloaded) {
				continue;
			}
			// アップロードされた zip 由来の値なので、バックトラックが二次時間になる形は避ける
			// (`[a-zA-Z0-9_]+?` と `[a-zA-Z0-9.]+` のように英数字が重複すると分割点が曖昧になる)
			if (!/^[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9.]*)?$/.test(record.fileName)) {
				continue;
			}
			const emojiInfo = record.emoji;
			if (!/^[a-zA-Z0-9_]+$/.test(emojiInfo.name)) {
				continue;
			}
			const content = zip.readFile(record.fileName, MAX_EMOJI_IMPORT_FILE_BYTES);
			if (content == null) {
				continue;
			}
			// 書き出し先の名前は zip の内容から作らない。1 件ずつ消すので、展開後の合計でディスクが埋まらない。
			const emojiPath = `${path}/emoji-${index}`;
			await fs.promises.writeFile(emojiPath, content, { flag: 'wx' });
			await deleteEmojiByNameAndHostFromDatabase(deps.db, emojiInfo.name, null);

			try {
				const driveFile = await addDriveFile(deps, {
					user: null,
					path: emojiPath,
					name: record.fileName,
					force: true,
				});
				await addCustomEmoji(deps, {
					originalUrl: driveFile.url,
					publicUrl: driveFile.webpublicUrl ?? driveFile.url,
					fileType: driveFile.webpublicType ?? driveFile.type,
					name: emojiInfo.name,
					category: emojiInfo.category,
					host: null,
					aliases: emojiInfo.aliases,
					license: emojiInfo.license,
					isSensitive: emojiInfo.isSensitive,
					localOnly: emojiInfo.localOnly,
					roleIdsThatCanBeUsedThisEmojiAsReaction: [],
				});
			} catch {
				// 1件の失敗でインポート全体を中断しない。
				continue;
			} finally {
				await fs.promises.rm(emojiPath, { force: true });
			}
		}

		cleanup();
	} catch (e) {
		cleanup();
		throw e;
	}
}
