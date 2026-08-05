/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env['NODE_ENV'] = 'test';

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { loadConfig, type Config } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool, type MiDrizzleDatabase, type MiDrizzlePool } from '@/drizzle.js';
import { listAllDriveFilesByUserIdFromDatabase } from '@/core/DriveFileStore.js';
import { fetchMetaFromDatabase } from '@/core/MetaStore.js';
import { createUserWithProfileAndPublickeyInDatabase, deleteUserByIdFromDatabase } from '@/core/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { addDriveFileForHonoApi, type HonoApiDriveFileUploadDependencies } from '@/server/rest/drive-file-upload.js';
import type { MiMeta } from '@/models/Meta.js';
import type { MiUser } from '@/models/User.js';

describe('addDriveFileForHonoApi quota serialization', () => {
	let config: Config;
	let pool: MiDrizzlePool;
	let db: MiDrizzleDatabase;
	let meta: MiMeta;
	let user: MiUser;
	let tempDir: string;

	beforeAll(async () => {
		config = loadConfig();
		pool = createDrizzlePool(config);
		db = createDrizzleDatabase(pool, config);
		meta = {
			...await fetchMetaFromDatabase(db),
			useObjectStorage: true,
			objectStorageBucket: 'drive-quota-test',
			objectStorageBaseUrl: 'https://storage.example.test',
			policies: {
				...((await fetchMetaFromDatabase(db)).policies ?? {}),
				driveCapacityMb: 1,
			},
		};
		const id = genId();
		user = await createUserWithProfileAndPublickeyInDatabase(db, {
			user: {
				id,
				username: `drivequota${id}`,
				usernameLower: `drivequota${id}`,
				isExplorable: false,
			},
			profile: { userId: id },
		});
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'misskey-drive-quota-'));
	}, 60_000);

	afterAll(async () => {
		await deleteUserByIdFromDatabase(db, user.id);
		await pool.end();
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	test('concurrent uploads persist only within quota and clean the rejected object', async () => {
		const fileSize = 700 * 1024;
		const paths = [path.join(tempDir, 'first.bin'), path.join(tempDir, 'second.bin')];
		await Promise.all(paths.map(filePath => fs.writeFile(filePath, Buffer.alloc(1))));

		let uploadedCount = 0;
		let releaseUploads: (() => void) | undefined;
		const uploadsReady = new Promise<void>(resolve => {
			releaseUploads = resolve;
		});
		const storedKeys = new Set<string>();
		const deletedKeys: string[] = [];
		const upload = vi.fn(async (_meta, input) => {
			storedKeys.add(input.Key as string);
			uploadedCount++;
			if (uploadedCount === paths.length) releaseUploads?.();
			await uploadsReady;
			return { Bucket: input.Bucket as string, Key: input.Key as string, Location: `https://storage.example.test/${input.Key as string}` };
		});
		const deleteObject = vi.fn(async (_meta, input) => {
			const key = input.Key as string;
			storedKeys.delete(key);
			deletedKeys.push(key);
			return {};
		});
		const update = vi.fn();
		const deps = {
			config,
			db,
			meta,
			fileInfoService: {
				getFileInfo: vi.fn(async (filePath: string) => ({
					size: fileSize,
					md5: filePath.endsWith('first.bin') ? '11111111111111111111111111111111' : '22222222222222222222222222222222',
					type: { mime: 'text/plain', ext: 'txt' },
					width: undefined,
					height: undefined,
					orientation: undefined,
					blurhash: undefined,
					sensitive: false,
					porn: false,
				})),
			},
			imageProcessingService: {},
			videoProcessingService: {},
			internalStorageService: { del: vi.fn(), saveFromBuffer: vi.fn(), saveFromPath: vi.fn() },
			s3Service: { upload, delete: deleteObject },
			chartWriters: {
				driveChart: { update },
				perUserDriveChart: { update },
				instanceChart: { updateDrive: update },
			},
			logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
		} as unknown as HonoApiDriveFileUploadDependencies;

		const results = await Promise.allSettled(paths.map(filePath => addDriveFileForHonoApi(deps, {
			user,
			path: filePath,
			force: true,
		})));
		const failures = results
			.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
			.map(result => String(result.reason));

		expect(results.filter(result => result.status === 'fulfilled'), failures.join('\n')).toHaveLength(1);
		const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
		expect(rejected).toHaveLength(1);
		expect(rejected[0]?.reason).toMatchObject({ id: 'c6244ed2-a39a-4e1c-bf93-f0fbd7764fa6' });
		const files = await listAllDriveFilesByUserIdFromDatabase(db, user.id);
		expect(upload).toHaveBeenCalledTimes(2);
		expect(files).toHaveLength(1);
		expect(files[0]?.size).toBe(fileSize);
		expect(storedKeys).toEqual(new Set([files[0]?.accessKey]));
		expect(deletedKeys).toHaveLength(1);
	});

	// 失敗を握り潰すと、実体の無いオブジェクトを指す DriveFile が DB に残り、API は成功を返すのに URL が 404 になる
	test('object storage upload failure rejects the request and leaves no drive file behind', async () => {
		const filePath = path.join(tempDir, 'upload-failure.bin');
		await fs.writeFile(filePath, Buffer.alloc(1));

		const before = await listAllDriveFilesByUserIdFromDatabase(db, user.id);
		const uploadedKeys: string[] = [];
		const deletedKeys: string[] = [];
		const upload = vi.fn(async (_meta, input) => {
			uploadedKeys.push(input.Key as string);
			throw new Error('object storage is down');
		});
		const deleteObject = vi.fn(async (_meta, input) => {
			deletedKeys.push(input.Key as string);
			return {};
		});
		const update = vi.fn();
		const deps = {
			config,
			db,
			meta,
			fileInfoService: {
				getFileInfo: vi.fn(async () => ({
					size: 1024,
					md5: '33333333333333333333333333333333',
					type: { mime: 'text/plain', ext: 'txt' },
					width: undefined,
					height: undefined,
					orientation: undefined,
					blurhash: undefined,
					sensitive: false,
					porn: false,
				})),
			},
			imageProcessingService: {},
			videoProcessingService: {},
			internalStorageService: { del: vi.fn(), saveFromBuffer: vi.fn(), saveFromPath: vi.fn() },
			s3Service: { upload, delete: deleteObject },
			chartWriters: {
				driveChart: { update },
				perUserDriveChart: { update },
				instanceChart: { updateDrive: update },
			},
			logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
		} as unknown as HonoApiDriveFileUploadDependencies;

		await expect(addDriveFileForHonoApi(deps, { user, path: filePath, force: true })).rejects.toThrow('object storage is down');

		const after = await listAllDriveFilesByUserIdFromDatabase(db, user.id);
		expect(after).toHaveLength(before.length);
		// 途中まで書けている可能性があるので、中断時も掃除を試みる
		expect(deletedKeys).toEqual(uploadedKeys);
	});

	test('aborted upload result is treated as a failure', async () => {
		const filePath = path.join(tempDir, 'upload-aborted.bin');
		await fs.writeFile(filePath, Buffer.alloc(1));

		const before = await listAllDriveFilesByUserIdFromDatabase(db, user.id);
		const update = vi.fn();
		const deps = {
			config,
			db,
			meta,
			fileInfoService: {
				getFileInfo: vi.fn(async () => ({
					size: 1024,
					md5: '44444444444444444444444444444444',
					type: { mime: 'text/plain', ext: 'txt' },
					width: undefined,
					height: undefined,
					orientation: undefined,
					blurhash: undefined,
					sensitive: false,
					porn: false,
				})),
			},
			imageProcessingService: {},
			videoProcessingService: {},
			internalStorageService: { del: vi.fn(), saveFromBuffer: vi.fn(), saveFromPath: vi.fn() },
			// マルチパートアップロードの中断結果には Bucket が含まれない
			s3Service: { upload: vi.fn(async () => ({ Key: 'aborted' })), delete: vi.fn(async () => ({})) },
			chartWriters: {
				driveChart: { update },
				perUserDriveChart: { update },
				instanceChart: { updateDrive: update },
			},
			logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
		} as unknown as HonoApiDriveFileUploadDependencies;

		await expect(addDriveFileForHonoApi(deps, { user, path: filePath, force: true })).rejects.toThrow(/Upload aborted/);
		expect(await listAllDriveFilesByUserIdFromDatabase(db, user.id)).toHaveLength(before.length);
	});
});
