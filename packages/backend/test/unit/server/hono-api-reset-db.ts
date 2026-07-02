/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import type * as Redis from 'ioredis';
import type { MiDrizzleDatabase, MiDrizzlePool } from '@/drizzle.js';
import type { MiMeta } from '@/models/Meta.js';
import { createApiShellApp, type ApiShellDependencies } from '@/server/hono-api-shell.js';
import { handleHonoApiResetDb } from '@/server/hono-api-reset-db.js';

const { fetchMetaFromDatabaseMock, resetDbMock } = vi.hoisted(() => ({
	fetchMetaFromDatabaseMock: vi.fn(),
	resetDbMock: vi.fn(),
}));

vi.mock('@/core/MetaStore.js', () => ({
	fetchMetaFromDatabase: fetchMetaFromDatabaseMock,
}));

vi.mock('@/misc/reset-db.js', () => ({
	resetDb: resetDbMock,
}));

function createDeps() {
	const meta = {
		id: 'x',
		name: 'before',
		rootUser: { id: 'root' },
	} as MiMeta;
	const flushdb = vi.fn();
	const info = vi.fn();
	const publishInternalEvent = vi.fn();

	return {
		deps: {
			db: {} as MiDrizzleDatabase,
			dbPool: {} as MiDrizzlePool,
			meta,
			redis: { flushdb } as unknown as Redis.Redis,
			logger: { info },
			publishInternalEvent,
		},
		flushdb,
		info,
		meta,
		publishInternalEvent,
	};
}

describe('handleHonoApiResetDb', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
		process.env.NODE_ENV = 'test';
	});

	test('resets redis and database, then refreshes reactive meta', async () => {
		vi.useFakeTimers();
		const steps: string[] = [];
		const after = {
			id: 'x',
			name: 'after',
			rootUser: null,
		} as MiMeta;
		const { deps, flushdb, info, meta, publishInternalEvent } = createDeps();

		flushdb.mockImplementation(async () => {
			steps.push('flushdb');
		});
		resetDbMock.mockImplementation(async () => {
			steps.push('resetDb');
		});
		fetchMetaFromDatabaseMock.mockImplementation(async () => {
			steps.push('fetchMeta');
			return after;
		});

		const promise = handleHonoApiResetDb(deps, {});
		await vi.advanceTimersByTimeAsync(1000);
		await promise;

		expect(steps).toEqual(['flushdb', 'resetDb', 'fetchMeta']);
		expect(meta.name).toBe('after');
		expect(meta.rootUser).toBeNull();
		expect(publishInternalEvent).toHaveBeenCalledWith('metaUpdated', { after });
		expect(info).toHaveBeenCalledWith('---- Resetting database...');
		expect(info).toHaveBeenCalledWith('---- Database reset complete.');
	});

	test('rejects outside test environment before destructive operations', async () => {
		process.env.NODE_ENV = 'production';
		const { deps, flushdb } = createDeps();

		await expect(handleHonoApiResetDb(deps, {})).rejects.toThrow('NODE_ENV is not a test');

		expect(flushdb).not.toHaveBeenCalled();
		expect(resetDbMock).not.toHaveBeenCalled();
		expect(fetchMetaFromDatabaseMock).not.toHaveBeenCalled();
	});

	test('api shell route returns no content after reset', async () => {
		vi.useFakeTimers();
		const { deps } = createDeps();

		fetchMetaFromDatabaseMock.mockResolvedValue({
			id: 'x',
			name: 'after',
			rootUser: null,
		} as MiMeta);
		resetDbMock.mockResolvedValue(undefined);

		const app = createApiShellApp(deps as unknown as ApiShellDependencies);
		const response = app.request('/reset-db', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: '{}',
		});
		await vi.advanceTimersByTimeAsync(1000);
		const res = await response;

		expect(res.status).toBe(204);
		expect(await res.text()).toBe('');
	});
});
