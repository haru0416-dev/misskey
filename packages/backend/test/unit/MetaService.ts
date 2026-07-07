/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { afterAll, beforeAll, describe, test, expect, vi } from 'vitest';
import { loadConfig } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool } from '@/drizzle.js';
import { MetaService } from '@/core/MetaService.js';
import type { MiDrizzleDatabase, MiDrizzlePool } from '@/drizzle.js';
import type * as Redis from 'ioredis';

describe('MetaService', () => {
	let pool: MiDrizzlePool;
	let db: MiDrizzleDatabase;
	let metaService: MetaService;

	beforeAll(async () => {
		const config = loadConfig();
		pool = createDrizzlePool(config);
		db = createDrizzleDatabase(pool, config);

		const redisForSub = { on: () => {}, off: () => {} } as unknown as Redis.Redis;
		const unused = undefined as never;
		metaService = new MetaService(redisForSub, db, unused, unused);

		// Make it cached
		await metaService.fetch();
	});

	afterAll(async () => {
		await pool.end();
	});

	test('fetch (cache)', async () => {
		const spy = vi.spyOn(db, 'transaction');

		const result = await metaService.fetch();

		expect(result.id).toBe('x');
		expect(spy).toHaveBeenCalledTimes(0);
	});

	test('fetch (force)', async () => {
		const spy = vi.spyOn(db, 'transaction');

		const result = await metaService.fetch(true);

		expect(result.id).toBe('x');
		expect(spy).toHaveBeenCalledTimes(1);
	});
});
