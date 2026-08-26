/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import type * as Redis from 'ioredis';
import { tryLockFetchInstanceMetadata, unlockFetchInstanceMetadata } from '@/server/rest/federation.js';

describe('federation metadata lock', () => {
	test('uses only the expiring v2 lock key', async () => {
		const set = vi.fn(async () => null);
		const redis = { set } as unknown as Pick<Redis.Redis, 'set'>;

		await expect(tryLockFetchInstanceMetadata({ redis }, 'example.com')).resolves.toBeNull();
		expect(set).toHaveBeenCalledOnce();
		expect(set).toHaveBeenCalledWith('fetchInstanceMetadata:mutex:v2:example.com', '1', 'EX', 30, 'GET');
	});

	test('deletes the v2 lock key when unlocking', async () => {
		const del = vi.fn(async () => 1);
		const redis = { del } as unknown as Pick<Redis.Redis, 'del'>;

		await expect(unlockFetchInstanceMetadata({ redis }, 'example.com')).resolves.toBe(1);
		expect(del).toHaveBeenCalledOnce();
		expect(del).toHaveBeenCalledWith('fetchInstanceMetadata:mutex:v2:example.com');
	});
});
