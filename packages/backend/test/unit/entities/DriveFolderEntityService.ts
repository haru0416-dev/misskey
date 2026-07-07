/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool } from '@/drizzle.js';
import { DriveFolderEntityService } from '@/core/entities/DriveFolderEntityService.js';
import { IdService } from '@/core/IdService.js';
import { genAidx } from '@/misc/id/aidx.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import { createDriveFolderInDatabase } from '@/core/DriveFolderStore.js';
import { createDriveFileInDatabase } from '@/core/DriveFileStore.js';
import type { DriveFileInsert } from '@/db/schema/drive-file.js';
import type { MiDrizzleDatabase, MiDrizzlePool } from '@/drizzle.js';

const describeBenchmark = process.env.RUN_BENCHMARKS === '1' ? describe : describe.skip;

describe('DriveFolderEntityService', () => {
	let pool: MiDrizzlePool;
	let service: DriveFolderEntityService;
	let db: MiDrizzleDatabase;
	let idCounter = 0;

	const nextId = () => genAidx(Date.now() + (idCounter++));

	const createFolder = async (name: string, parentId: string | null) => {
		const id = nextId();
		return createDriveFolderInDatabase(db, {
			id,
			name,
			userId: null,
			parentId,
		});
	};

	const createFile = async (folderId: string | null) => {
		const id = nextId();
		await createDriveFileInDatabase(db, {
			id,
			userId: null,
			userHost: null,
			md5: secureRndstr(32),
			name: `file-${id}`,
			type: 'text/plain',
			size: 1,
			comment: null,
			blurhash: null,
			properties: {},
			storedInternal: true,
			url: `https://example.com/${id}`,
			thumbnailUrl: null,
			webpublicUrl: null,
			webpublicType: null,
			accessKey: null,
			thumbnailAccessKey: null,
			webpublicAccessKey: null,
			uri: null,
			src: null,
			folderId,
			isSensitive: false,
			maybeSensitive: false,
			maybePorn: false,
			isLink: false,
			requestHeaders: null,
			requestIp: null,
		} satisfies DriveFileInsert);
	};

	beforeAll(async () => {
		const config = loadConfig();
		pool = createDrizzlePool(config);
		db = createDrizzleDatabase(pool, config);

		const idService = new IdService(config);
		service = new DriveFolderEntityService(db, idService);
	});

	afterAll(async () => {
		await pool.end();
	});

	describe('pack', () => {
		test('detail: false', async () => {
			const root = await createFolder('root', null);
			const child = await createFolder('child', root.id);

			const packed = await service.pack(child, { detail: false }) as any;
			expect(packed.id).toBe(child.id);
			expect(packed.parentId).toBe(root.id);
			expect(packed.parent).toBeUndefined();
			expect(packed.foldersCount).toBeUndefined();
			expect(packed.filesCount).toBeUndefined();
		});

		test('detail: true', async () => {
			const root = await createFolder('root-detail', null);
			const child = await createFolder('child-detail', root.id);
			await createFolder('grandchild-detail', child.id);
			await createFile(child.id);
			await createFile(child.id);

			const packed = await service.pack(child, { detail: true }) as any;
			expect(packed.id).toBe(child.id);
			expect(packed.foldersCount).toBe(1);
			expect(packed.filesCount).toBe(2);
			expect(packed.parent?.id).toBe(root.id);
			expect(packed.parent?.parent).toBeUndefined();
		});

		test('detail: true reaches root for deep hierarchy', async () => {
			const root = await createFolder('root-deep', null);
			const level1 = await createFolder('level-1', root.id);
			const level2 = await createFolder('level-2', level1.id);
			const level3 = await createFolder('level-3', level2.id);
			const level4 = await createFolder('level-4', level3.id);
			const level5 = await createFolder('level-5', level4.id);

			const packed = await service.pack(level5, { detail: true }) as any;
			expect(packed.id).toBe(level5.id);
			expect(packed.parent?.id).toBe(level4.id);
			expect(packed.parent?.parent?.id).toBe(level3.id);
			expect(packed.parent?.parent?.parent?.id).toBe(level2.id);
			expect(packed.parent?.parent?.parent?.parent?.id).toBe(level1.id);
			expect(packed.parent?.parent?.parent?.parent?.parent?.id).toBe(root.id);
			expect(packed.parent?.parent?.parent?.parent?.parent?.parent).toBeUndefined();
		});
	});

	describe('packMany', () => {
		test('preserves order and packs parents', async () => {
			const root = await createFolder('root-many', null);
			const childA = await createFolder('child-a', root.id);
			const childB = await createFolder('child-b', root.id);
			await createFolder('child-a-sub', childA.id);
			await createFile(childA.id);

			const packed = await service.packMany([childB, childA], { detail: true }) as any;
			expect(packed[0].id).toBe(childB.id);
			expect(packed[1].id).toBe(childA.id);
			expect(packed[0].parent?.id).toBe(root.id);
			expect(packed[1].parent?.id).toBe(root.id);
			expect(packed[0].filesCount).toBe(0);
			expect(packed[1].filesCount).toBe(1);
			expect(packed[0].foldersCount).toBe(0);
			expect(packed[1].foldersCount).toBe(1);
		});
	});

	describeBenchmark('benchmark', () => {
		test('packMany', async () => {
			const root = await createFolder('bench-root', null);
			const folders = [];
			for (let i = 0; i < 200; i++) {
				folders.push(await createFolder(`bench-${i}`, root.id));
			}

			const start = Date.now();
			await service.packMany(folders, { detail: true });
			const elapsed = Date.now() - start;
			console.log(`DriveFolderEntityService.packMany benchmark: ${elapsed}ms`);
		});
	});
});
