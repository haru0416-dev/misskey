/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// createRuntimeDependencies() が構築する UrlPreviewService は rolldown の `define` で注入される
// _SUMMALY_VERSION_ を参照するが、vitest はソースを直接importするだけでrolldownを経由しないため
// 未定義になる。テスト用にダミー値を注入しておく。
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as fs from 'node:fs';
import { ZipArchive } from 'archiver';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import type * as Bull from 'bullmq';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { emoji } from '@/db/schema/emoji.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/UserStore.js';
import { createDriveFileInDatabase, listDriveFilesByUserIdWithPaginationFromDatabase } from '@/core/DriveFileStore.js';
import { insertEmojiInDatabase, fetchEmojiByNameAndHostFromDatabase } from '@/core/EmojiStore.js';
import { createRoleInDatabase } from '@/core/RoleStore.js';
import { createRoleAssignmentInDatabase } from '@/core/RoleAssignmentStore.js';
import { createTemp } from '@/misc/create-temp.js';
import { genId } from '@/misc/id/gen-id.js';
import {
	handleHonoQueueExportCustomEmojis,
	handleHonoQueueImportCustomEmojis,
	type HonoQueueEmojisDependencies,
} from '@/queue/handlers/emojis.js';
import type { DbJobDataWithUser, DbUserImportJobData } from '@/queue/types.js';
import type { RuntimeDependencies as RuntimeDeps } from '@/runtime-dependencies.js';
import type { MiUser } from '@/models/User.js';

function fakeJob<T>(data: T): Bull.Job<T> {
	return { data, updateProgress: async () => {} } as unknown as Bull.Job<T>;
}

// カスタム絵文字export/importはDriveService.addFileのuploadableFileTypesチェックに
// application/zipが含まれないため、モデレーターでない限り常に失敗する
// そのためテストユーザーには明示的にモデレーターロールを付与する。
async function createModeratorTestUser(runtime: RuntimeDeps, prefix: string): Promise<MiUser> {
	const id = genId();
	const user = await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
		user: { id, username: `${prefix}${id}`, usernameLower: `${prefix}${id}`.toLowerCase() },
		profile: { userId: id },
	});
	const roleId = genId();
	await createRoleInDatabase(runtime.db, {
		id: roleId,
		name: `${prefix}role${roleId}`,
		description: '',
		updatedAt: new Date(),
		lastUsedAt: new Date(),
		isModerator: true,
	});
	await createRoleAssignmentInDatabase(runtime.db, { id: genId(), userId: user.id, roleId, expiresAt: null });
	return user;
}

async function serveBuffer(buffer: Buffer, contentType: string): Promise<{ url: string; server: Server }> {
	const server: Server = createServer((_req, res) => {
		res.writeHead(200, { 'Content-Type': contentType });
		res.end(buffer);
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			server.off('error', reject);
			resolve();
		});
	});
	const address = server.address() as AddressInfo;
	return { url: `http://127.0.0.1:${address.port}/file`, server };
}

describe('hono-queue-emojis', () => {
	let runtime: RuntimeDependencies;
	let deps: HonoQueueEmojisDependencies;
	let servers: Server[] = [];

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = { ...runtime, logger: runtime.loggerService.getLogger('test-emojis') };
	});

	afterEach(() => {
		for (const server of servers) server.close();
		servers = [];
	});

	afterAll(async () => {
		// export/importテストで作成したhost: nullの絵文字を残すと、
		// 後続で実行される他のテストファイル (CustomEmojiService等) の全件カウントを汚染する
		await runtime.db.delete(emoji);
		await runtime.dispose();
	});

	test('handleHonoQueueExportCustomEmojis: ローカル絵文字をzipとしてドライブに保存する', async () => {
		const user = await createModeratorTestUser(runtime, 'honoqueueemoji');

		const pngBytes = Buffer.from('89504e470d0a1a0a', 'hex');
		const { url, server } = await serveBuffer(pngBytes, 'image/png');
		servers.push(server);

		const emojiName = `honoqueueemoji${genId()}`;
		await insertEmojiInDatabase(runtime.db, {
			id: genId(),
			updatedAt: new Date(),
			name: emojiName,
			host: null,
			originalUrl: url,
			publicUrl: url,
			type: 'image/png',
		});

		await handleHonoQueueExportCustomEmojis(deps, fakeJob<DbJobDataWithUser>({ user: { id: user.id } }));

		const files = await listDriveFilesByUserIdWithPaginationFromDatabase(runtime.db, user.id, { limit: 10 });
		expect(files.some((f) => f.name.startsWith('custom-emojis-') && f.name.endsWith('.zip'))).toBe(true);
	});

	test('存在しないuserIdは何もしない (export)', async () => {
		await expect(
			handleHonoQueueExportCustomEmojis(deps, fakeJob<DbJobDataWithUser>({ user: { id: genId() } })),
		).resolves.toBeUndefined();
	});

	test('handleHonoQueueImportCustomEmojis: zipから絵文字をインポートする', async () => {
		const emojiName = `honoqueueimpemoji${genId()}`;
		const pngBytes = Buffer.from('89504e470d0a1a0a', 'hex');

		const [zipPath, cleanupZip] = await createTemp();
		await new Promise<void>((resolve, reject) => {
			const archiveStream = fs.createWriteStream(zipPath);
			const archive = new ZipArchive({ zlib: { level: 0 } });
			archiveStream.on('close', () => resolve());
			archive.on('error', reject);
			archive.pipe(archiveStream);

			const meta = {
				metaVersion: 2,
				host: null,
				exportedAt: new Date().toString(),
				emojis: [
					{
						fileName: `${emojiName}.png`,
						downloaded: true,
						emoji: {
							name: emojiName,
							category: null,
							aliases: [],
							license: null,
							isSensitive: false,
							localOnly: false,
						},
					},
				],
			};

			archive.append(JSON.stringify(meta), { name: 'meta.json' });
			archive.append(pngBytes, { name: `${emojiName}.png` });
			archive.finalize();
		});

		try {
			const zipBuffer = await fs.promises.readFile(zipPath);
			const { url, server } = await serveBuffer(zipBuffer, 'application/zip');
			servers.push(server);

			const user = await createModeratorTestUser(runtime, 'honoqueueimpemojiuser');

			const fileId = genId();
			await createDriveFileInDatabase(runtime.db, {
				id: fileId,
				md5: 'dummy',
				name: 'emojis.zip',
				type: 'application/zip',
				size: zipBuffer.length,
				storedInternal: false,
				url,
				userId: user.id,
				userHost: null,
			});

			await handleHonoQueueImportCustomEmojis(deps, fakeJob<DbUserImportJobData>({ user: { id: user.id }, fileId }));

			const imported = await fetchEmojiByNameAndHostFromDatabase(runtime.db, emojiName, null);
			expect(imported).not.toBeNull();
		} finally {
			cleanupZip();
		}
	});

	test('存在しないfileIdは何もしない (import)', async () => {
		const id = genId();
		await expect(
			handleHonoQueueImportCustomEmojis(deps, fakeJob<DbUserImportJobData>({ user: { id }, fileId: genId() })),
		).resolves.toBeUndefined();
	});
});
