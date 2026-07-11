/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { format as dateFormat } from 'date-fns';
import mime from 'mime-types';
import { ZipArchive } from 'archiver';
import { ZipReader } from 'slacc';
import type * as Bull from 'bullmq';
import { deleteEmojiByNameAndHostFromDatabase, listLocalEmojisOrderedByIdFromDatabase } from '@/core/EmojiStore.js';
import { fetchDriveFileByIdFromDatabase } from '@/core/DriveFileStore.js';
import { fetchUserByIdFromDatabase } from '@/core/UserStore.js';
import { createTemp, createTempDir } from '@/misc/create-temp.js';
import type { DownloadService } from '@/core/DownloadService.js';
import type { DbJobDataWithUser, DbUserImportJobData } from '@/queue/types.js';
import { addDriveFileForHonoApi, type HonoApiDriveFileUploadDependencies } from '../../server/rest/drive-file-upload.js';
import { addCustomEmojiForHonoApi, type HonoApiEmojiDependencies } from '../../server/rest/emojis.js';
import { createExportCompletedNotification, type HonoApiNotificationDependencies } from '../../server/rest/notification.js';

export type HonoQueueEmojisDependencies = HonoApiDriveFileUploadDependencies & HonoApiEmojiDependencies & HonoApiNotificationDependencies & {
	downloadService: Pick<DownloadService, 'downloadUrl'>;
};

function writeToFile(stream: fs.WriteStream, content: string): Promise<void> {
	return new Promise<void>((res, rej) => {
		stream.write(content, err => {
			if (err) {
				rej(err);
			} else {
				res();
			}
		});
	});
}

export async function handleHonoQueueExportCustomEmojis(deps: HonoQueueEmojisDependencies, job: Bull.Job<DbJobDataWithUser>): Promise<void> {
	const user = await fetchUserByIdFromDatabase(deps.db, job.data.user.id);
	if (user == null) return;

	const [path, cleanup] = await createTempDir();

	const metaPath = path + '/meta.json';
	fs.writeFileSync(metaPath, '', 'utf-8');
	const metaStream = fs.createWriteStream(metaPath, { flags: 'a' });

	await writeToFile(metaStream, `{"metaVersion":2,"host":"${deps.config.host}","exportedAt":"${new Date().toString()}","emojis":[`);

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
			await deps.downloadService.downloadUrl(emoji.originalUrl, emojiPath);
			downloaded = true;
		} catch {
			// 元実装同様、ダウンロード失敗した絵文字はdownloaded:falseで記録して継続する
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
	metaStream.end();

	const [archivePath, archiveCleanup] = await createTemp();
	await new Promise<void>((resolve) => {
		const archiveStream = fs.createWriteStream(archivePath);
		const archive = new ZipArchive({
			zlib: { level: 0 },
		});
		archiveStream.on('close', async () => {
			const fileName = 'custom-emojis-' + dateFormat(new Date(), 'yyyy-MM-dd-HH-mm-ss') + '.zip';
			const driveFile = await addDriveFileForHonoApi(deps, { user, path: archivePath, name: fileName, force: true });

			createExportCompletedNotification(deps, user.id, 'customEmoji', driveFile.id);

			cleanup();
			archiveCleanup();
			resolve();
		});
		archive.pipe(archiveStream);
		archive.directory(path, false);
		archive.finalize();
	});
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

export async function handleHonoQueueImportCustomEmojis(deps: HonoQueueEmojisDependencies, job: Bull.Job<DbUserImportJobData>): Promise<void> {
	const file = await fetchDriveFileByIdFromDatabase(deps.db, job.data.fileId);
	if (file == null) return;

	const [path, cleanup] = await createTempDir();

	const destPath = path + '/emojis.zip';

	try {
		fs.writeFileSync(destPath, '', 'binary');
		await deps.downloadService.downloadUrl(file.url, destPath);
	} catch (e) {
		cleanup();
		throw e;
	}

	const outputPath = path + '/emojis';
	try {
		ZipReader.withDestinationPath(outputPath).viaBuffer(await fs.promises.readFile(destPath));
		const metaRaw = fs.readFileSync(outputPath + '/meta.json', 'utf-8');
		const meta = JSON.parse(metaRaw) as { emojis: ExportedEmojiMetaRecord[] };

		for (const record of meta.emojis) {
			if (!record.downloaded) continue;
			if (!/^[a-zA-Z0-9_]+?([a-zA-Z0-9.]+)?$/.test(record.fileName)) continue;
			const emojiInfo = record.emoji;
			if (!/^[a-zA-Z0-9_]+$/.test(emojiInfo.name)) continue;
			const emojiPath = outputPath + '/' + record.fileName;
			await deleteEmojiByNameAndHostFromDatabase(deps.db, emojiInfo.name, null);

			try {
				const driveFile = await addDriveFileForHonoApi(deps, {
					user: null,
					path: emojiPath,
					name: record.fileName,
					force: true,
				});
				await addCustomEmojiForHonoApi(deps, {
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
				// 元実装同様、1件の失敗はログのみで継続する
				continue;
			}
		}

		cleanup();
	} catch (e) {
		cleanup();
		throw e;
	}
}
