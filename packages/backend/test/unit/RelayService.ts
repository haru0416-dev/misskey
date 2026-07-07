/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { afterAll, beforeAll, describe, test, expect, vi } from 'vitest';
import type { Mocked } from 'vitest';
import type * as Redis from 'ioredis';
import { loadConfig } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool } from '@/drizzle.js';
import { IdService } from '@/core/IdService.js';
import { QueueService } from '@/core/QueueService.js';
import { RelayService } from '@/core/RelayService.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';
import type { MiDrizzleDatabase, MiDrizzlePool } from '@/drizzle.js';
import type { MiMeta } from '@/models/Meta.js';

describe('RelayService', () => {
	let pool: MiDrizzlePool;
	let relayService: RelayService;
	let queueService: Mocked<QueueService>;

	beforeAll(async () => {
		const config = loadConfig();
		pool = createDrizzlePool(config);
		const db: MiDrizzleDatabase = createDrizzleDatabase(pool, config);

		const idService = new IdService(config);
		const redisForSub = { on: () => {}, off: () => {} } as unknown as Redis.Redis;
		const meta = { name: null } as MiMeta;
		const systemAccountService = new SystemAccountService(redisForSub, meta, db, idService);
		queueService = { deliver: vi.fn() } as unknown as Mocked<QueueService>;
		// deliverToRelays (the only caller of apRendererService) is not exercised by any test
		// in this file — see the RelayService test-bootstrap task notes.
		const unused = undefined as never;

		relayService = new RelayService(config, db, idService, queueService, systemAccountService, unused);
	});

	afterAll(async () => {
		await pool.end();
	});

	test('addRelay', async () => {
		const result = await relayService.addRelay('https://example.com');

		expect(result.inbox).toBe('https://example.com');
		expect(result.status).toBe('requesting');
		expect(queueService.deliver).toHaveBeenCalled();
		expect(queueService.deliver.mock.lastCall![1]?.type).toBe('Follow');
		expect(queueService.deliver.mock.lastCall![2]).toBe('https://example.com');
		//expect(queueService.deliver.mock.lastCall![0].username).toBe('relay.actor');
	});

	test('listRelay', async () => {
		const result = await relayService.listRelay();

		expect(result.length).toBe(1);
		expect(result[0].inbox).toBe('https://example.com');
		expect(result[0].status).toBe('requesting');
	});

	test('removeRelay: succ', async () => {
		await relayService.removeRelay('https://example.com');

		expect(queueService.deliver).toHaveBeenCalled();
		expect(queueService.deliver.mock.lastCall![1]?.type).toBe('Undo');
		expect(typeof queueService.deliver.mock.lastCall![1]?.object).toBe('object');
		expect((queueService.deliver.mock.lastCall![1]?.object as any).type).toBe('Follow');
		expect(queueService.deliver.mock.lastCall![2]).toBe('https://example.com');
		//expect(queueService.deliver.mock.lastCall![0].username).toBe('relay.actor');

		const list = await relayService.listRelay();
		expect(list.length).toBe(0);
	});

	test('removeRelay: fail', async () => {
		await expect(relayService.removeRelay('https://x.example.com'))
			.rejects.toThrow('relay not found');
	});
});
