/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */


import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import {
	fetchRegistryItemFromDatabase,
	listRegistryItemsOfScopeFromDatabase,
	setRegistryItemInDatabase,
} from '@/core/RegistryItemStore.js';
import { createUserInDatabase } from '@/core/UserStore.js';
import { createDrizzleDatabase, createDrizzlePool, type MiDrizzleDatabase, type MiDrizzlePool } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';

describe('RegistryItemStore', () => {
	let pool: MiDrizzlePool;
	let db: MiDrizzleDatabase;

	beforeAll(() => {
		const config = loadConfig();
		pool = createDrizzlePool(config);
		db = createDrizzleDatabase(pool, config);
	});

	afterAll(async () => {
		await pool.end();
	});

	test('atomically upserts one row for a logical key with a null domain', async () => {
		const userId = genId();
		await createUserInDatabase(db, {
			id: userId,
			username: `registry${userId}`,
			usernameLower: `registry${userId}`,
		});

		const scope = ['atomic', userId];
		const key = 'shared';
		const attempts = Array.from({ length: 16 }, (_, index) => ({ id: genId(), value: `value-${index}` }));
		await Promise.all(
			attempts.map(async ({ id, value }, index) => {
				await setRegistryItemInDatabase(db, {
					id,
					updatedAt: new Date(index + 1),
					userId,
					domain: null,
					scope,
					key,
					value,
				});
			}),
		);

		const item = await fetchRegistryItemFromDatabase(db, userId, null, scope, key);
		const items = await listRegistryItemsOfScopeFromDatabase(db, userId, null, scope);

		expect(attempts.map((attempt) => attempt.id)).toContain(item?.id);
		expect(attempts.map((attempt) => attempt.value)).toContain(item?.value);
		expect(items).toHaveLength(1);
	});
});
