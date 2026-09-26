/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { SQL as NativeSqlClient } from 'bun';
import { loadConfig } from '@/config.js';
import { createBunSqlClient, createBunSqlDatabase } from '@/db/bun-sql.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { countInstanceNote, flushInstanceNoteCounts } from '@/core/instance/instance-notes-counter.js';
import { createInstanceInDatabase, fetchInstanceByHostFromDatabase } from '@/core/instance/InstanceStore.js';
import { genId } from '@/misc/id/gen-id.js';

// リモートの投稿数は投稿のトランザクションの外でまとめて反映する。同じサーバーの行を受信ごとに更新すると、
// 行ロックで並行した受信が直列になるため。まとめても数が失われないことを見る。
describe('instance notes counter', () => {
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

	const createInstance = async () => {
		const host = `counter-${genId()}.example.com`;
		await createInstanceInDatabase(db, { id: genId(), host, firstRetrievedAt: new Date() });
		return (await fetchInstanceByHostFromDatabase(db, host))!;
	};

	test('数えた分をまとめて反映する', async () => {
		const [a, b] = [await createInstance(), await createInstance()];
		for (let i = 0; i < 5; i++) countInstanceNote(db, a.id);
		countInstanceNote(db, b.id);
		await flushInstanceNoteCounts();
		expect((await fetchInstanceByHostFromDatabase(db, a.host))?.notesCount).toBe(5);
		expect((await fetchInstanceByHostFromDatabase(db, b.host))?.notesCount).toBe(1);
	});

	test('反映に失敗した分は捨てずに次の反映へ回す', async () => {
		const instance = await createInstance();
		const failingDb = {
			update: () => {
				throw new Error('database is unavailable');
			},
		} as unknown as MiDrizzleDatabase;
		countInstanceNote(failingDb, instance.id);
		await expect(flushInstanceNoteCounts()).rejects.toThrow('database is unavailable');

		countInstanceNote(db, instance.id);
		await flushInstanceNoteCounts();
		expect((await fetchInstanceByHostFromDatabase(db, instance.host))?.notesCount).toBe(2);
	});
});
