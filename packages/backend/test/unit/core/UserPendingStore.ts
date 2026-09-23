/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createBunSqlDatabase, createBunSqlClient } from '@/db/bun-sql.js';
import type { SQL as NativeSqlClient } from 'bun';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import {
	createUserPendingInDatabase,
	deleteUserPendingFromDatabase,
	fetchUserPendingByCodeFromDatabase,
} from '@/core/account/UserPendingStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';

describe('UserPendingStore', () => {
	let pool: NativeSqlClient;
	let db: MiDrizzleDatabase;

	beforeAll(() => {
		const config = loadConfig();
		pool = createBunSqlClient(config);
		db = createBunSqlDatabase(pool, config);
	});

	afterAll(async () => {
		await pool.close();
	});

	test('create, fetch, and delete pending user', async () => {
		const data = {
			id: genId(Date.now()),
			code: secureRndstr(16),
			username: secureRndstr(8),
			email: `${secureRndstr(8)}@example.test`,
			password: secureRndstr(32),
		};

		const created = await createUserPendingInDatabase(db, data);
		const fetched = await fetchUserPendingByCodeFromDatabase(db, data.code);

		expect(created).toEqual(data);
		expect(fetched).toEqual(data);

		await deleteUserPendingFromDatabase(db, data.id);

		await expect(fetchUserPendingByCodeFromDatabase(db, data.code)).rejects.toThrow('Pending user not found');
	});
});
