/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { loadConfig, type Config } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool, type MiDrizzleDatabase, type MiDrizzlePool } from '@/drizzle.js';
import { listAllDriveFilesByUserIdFromDatabase } from '@/core/drive/DriveFileStore.js';
import { fetchMetaFromDatabase } from '@/core/meta/MetaStore.js';
import { createUserWithProfileAndPublickeyInDatabase, deleteUserByIdFromDatabase } from '@/core/user/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { addDriveFileForApi, type ApiDriveFileUploadDependencies } from '@/server/rest/drive/drive-file-upload.js';
import type { MiMeta } from '@/models/Meta.js';
import type { MiUser } from '@/models/User.js';
import { queueOutbox } from '@/db/schema/queue-outbox.js';
import type { DbQueue } from '@/core/queue/queues.js';

describe('addDriveFileForApi quota serialization', () => {
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
			...(await fetchMetaFromDatabase(db)),
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
		await Promise.all(paths.map((filePath) => fs.writeFile(filePath, Buffer.alloc(1))));

		let uploadedCount = 0;
		let releaseUploads: (() => void) | undefined;
		const uploadsReady = new Promise<void>((resolve) => {
			releaseUploads = resolve;
		});
		const storedKeys = new Set<string>();
		const deletedKeys: string[] = [];
		const upload = vi.fn(async (_meta, input) => {
			storedKeys.add(input.key as string);
			uploadedCount++;
			if (uploadedCount === paths.length) releaseUploads?.();
			await uploadsReady;
		});
		const deleteObject = vi.fn(async (_meta, input) => {
			const key = input.key as string;
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
		} as unknown as ApiDriveFileUploadDependencies;

		const results = await Promise.allSettled(
			paths.map((filePath) =>
				addDriveFileForApi(deps, {
					user,
					path: filePath,
					force: true,
				}),
			),
		);
		const failures = results
			.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
			.map((result) => String(result.reason));

		expect(
			results.filter((result) => result.status === 'fulfilled'),
			failures.join('\n'),
		).toHaveLength(1);
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

	test('remote quota eviction commits the new file and deletion outbox atomically during a queue outage', async () => {
		const remoteId = genId();
		const remoteUser = await createUserWithProfileAndPublickeyInDatabase(db, {
			user: {
				id: remoteId,
				username: `drivequotaremote${remoteId}`,
				usernameLower: `drivequotaremote${remoteId}`,
				host: 'remote.example.test',
				uri: `https://remote.example.test/users/${remoteId}`,
				isExplorable: false,
			},
			profile: { userId: remoteId },
		});
		const paths = [path.join(tempDir, 'remote-first.bin'), path.join(tempDir, 'remote-second.bin')];
		await Promise.all(paths.map((filePath) => fs.writeFile(filePath, Buffer.alloc(1))));
		const storedKeys = new Set<string>();
		const deletedKeys: string[] = [];
		const upload = vi.fn(async (_meta, input) => {
			storedKeys.add(input.key as string);
		});
		const deps = {
			config,
			db,
			meta,
			dbQueue: { addBulk: vi.fn().mockRejectedValue(new Error('injected queue outage')) } as unknown as DbQueue,
			fileInfoService: {
				getFileInfo: vi.fn(async (filePath: string) => ({
					size: 700 * 1024,
					md5: filePath.endsWith('remote-first.bin')
						? '55555555555555555555555555555555'
						: '66666666666666666666666666666666',
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
			s3Service: {
				upload,
				delete: vi.fn(async (_meta, input) => {
					const key = input.key as string;
					storedKeys.delete(key);
					deletedKeys.push(key);
					return {};
				}),
			},
			chartWriters: {
				driveChart: { update: vi.fn() },
				perUserDriveChart: { update: vi.fn() },
				instanceChart: { updateDrive: vi.fn() },
			},
			logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
		} as unknown as ApiDriveFileUploadDependencies;

		try {
			await addDriveFileForApi(deps, { user: remoteUser, path: paths[0]!, force: true });
			const second = await addDriveFileForApi(deps, { user: remoteUser, path: paths[1]!, force: true });
			const files = await listAllDriveFilesByUserIdFromDatabase(db, remoteUser.id);
			const outboxRows = await db.select().from(queueOutbox).where(eq(queueOutbox.name, 'deleteDriveFile'));

			expect(files).toHaveLength(2);
			expect(storedKeys.has(second.accessKey!)).toBe(true);
			expect(deletedKeys).toHaveLength(0);
			expect(
				outboxRows.some((row) => files.some((file) => (row.data as { file?: { id?: string } }).file?.id === file.id)),
			).toBe(true);
		} finally {
			const remoteFiles = await listAllDriveFilesByUserIdFromDatabase(db, remoteUser.id);
			const remoteFileIds = new Set(remoteFiles.map((file) => file.id));
			const rows = await db.select().from(queueOutbox).where(eq(queueOutbox.name, 'deleteDriveFile'));
			const rowIds = rows
				.filter((row) => remoteFileIds.has((row.data as { file?: { id?: string } }).file?.id ?? ''))
				.map((row) => row.id);
			if (rowIds.length > 0) await db.delete(queueOutbox).where(inArray(queueOutbox.id, rowIds));
			await deleteUserByIdFromDatabase(db, remoteUser.id);
		}
	});

	// 失敗を無視すると、実体の無いオブジェクトを指す DriveFile が DB に残り、API は成功しても URL が 404 になる。
	// リモートユーザーのアバター/バナー取り込みでもこの経路を通る (ap-person)。
	// これらのストリームを購読するのはローカルのクライアントだけなので、リモート宛は無駄。
	test('ドライブのストリームはローカルユーザーにだけ流す', async () => {
		const remoteId = genId();
		const remoteUser = await createUserWithProfileAndPublickeyInDatabase(db, {
			user: {
				id: remoteId,
				username: `drivestreamremote${remoteId}`,
				usernameLower: `drivestreamremote${remoteId}`,
				host: 'remote.example.test',
				uri: `https://remote.example.test/users/${remoteId}`,
				isExplorable: false,
			},
			profile: { userId: remoteId },
		});

		const publishMainStream = vi.fn();
		const publishDriveStream = vi.fn();
		const update = vi.fn();
		const buildDeps = (md5: string) =>
			({
				config,
				db,
				meta,
				publishMainStream,
				publishDriveStream,
				fileInfoService: {
					getFileInfo: vi.fn(async () => ({
						size: 16,
						md5,
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
				s3Service: {
					upload: vi.fn(async () => undefined),
					delete: vi.fn(async () => undefined),
				},
				chartWriters: {
					driveChart: { update },
					perUserDriveChart: { update },
					instanceChart: { updateDrive: update },
				},
				logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
			}) as unknown as ApiDriveFileUploadDependencies;

		const remotePath = path.join(tempDir, 'stream-remote.bin');
		const localPath = path.join(tempDir, 'stream-local.bin');
		await fs.writeFile(remotePath, Buffer.alloc(16));
		await fs.writeFile(localPath, Buffer.alloc(16));

		try {
			await addDriveFileForApi(buildDeps('77777777777777777777777777777777'), {
				user: remoteUser,
				path: remotePath,
				force: true,
			});
			// publish は fire-and-forget なので、マイクロタスクを回してから見る。
			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(publishMainStream, 'リモート宛には流さない').not.toHaveBeenCalled();
			expect(publishDriveStream, 'リモート宛には流さない').not.toHaveBeenCalled();

			await addDriveFileForApi(buildDeps('88888888888888888888888888888888'), {
				user,
				path: localPath,
				force: true,
			});
			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(publishMainStream).toHaveBeenCalledWith(user.id, 'driveFileCreated', expect.anything());
			expect(publishDriveStream).toHaveBeenCalledWith(user.id, 'fileCreated', expect.anything());
		} finally {
			await deleteUserByIdFromDatabase(db, remoteUser.id);
		}
	});

	test('object storage upload failure rejects the request and leaves no drive file behind', async () => {
		const filePath = path.join(tempDir, 'upload-failure.bin');
		await fs.writeFile(filePath, Buffer.alloc(1));

		const before = await listAllDriveFilesByUserIdFromDatabase(db, user.id);
		const uploadedKeys: string[] = [];
		const deletedKeys: string[] = [];
		const upload = vi.fn(async (_meta, input) => {
			uploadedKeys.push(input.key as string);
			throw new Error('object storage is down');
		});
		const deleteObject = vi.fn(async (_meta, input) => {
			deletedKeys.push(input.key as string);
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
		} as unknown as ApiDriveFileUploadDependencies;

		await expect(addDriveFileForApi(deps, { user, path: filePath, force: true })).rejects.toThrow(
			'object storage is down',
		);

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
			// アップロードが失敗したら DriveFile を作らずに中断する。
			s3Service: {
				upload: vi.fn(async () => {
					throw new Error('Upload aborted');
				}),
				delete: vi.fn(async () => undefined),
			},
			chartWriters: {
				driveChart: { update },
				perUserDriveChart: { update },
				instanceChart: { updateDrive: update },
			},
			logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
		} as unknown as ApiDriveFileUploadDependencies;

		await expect(addDriveFileForApi(deps, { user, path: filePath, force: true })).rejects.toThrow(/Upload aborted/);
		expect(await listAllDriveFilesByUserIdFromDatabase(db, user.id)).toHaveLength(before.length);
	});
});
