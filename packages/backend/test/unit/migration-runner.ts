/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { SQL as NativeSqlClient } from 'bun';
import { loadConfig } from '@/config.js';
import type { Config } from '@/config.js';
import { createBunSqlClient } from '@/db/bun-sql.js';
import { reconcileNoteTextIndex } from '@/migration-runner.js';

// 本文の trigram index は設定 (search.noteTextIndex) に合わせて起動時に作る・消す。
// 書き込みの 8 割以上がこの index なので、SD カード等では外せる必要がある。
describe('reconcileNoteTextIndex', () => {
	let config: Config;
	let pool: NativeSqlClient;
	const withIndex = (noteTextIndex: boolean): Config => ({ ...config, search: { ...config.search, noteTextIndex } });
	const indexState = async () => {
		const rows = (await pool.unsafe(
			`SELECT i.indisvalid AS valid, pg_get_indexdef(c.oid) AS def FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname = 'IDX_NOTE_TEXT_TRGM'`,
		)) as { valid: boolean; def: string }[];
		return rows[0] ?? null;
	};

	beforeAll(() => {
		config = loadConfig();
		pool = createBunSqlClient(config);
	});

	afterAll(async () => {
		// 他のテストは migration が作った index がある前提なので戻す。
		await reconcileNoteTextIndex(withIndex(true));
		await pool.close();
	});

	test('無効にすると消し、有効に戻すと migration と同じ定義で作り直す', async () => {
		const fromMigration = await indexState();
		expect(fromMigration?.valid).toBe(true);
		expect(await reconcileNoteTextIndex(withIndex(false))).toBe('dropped');
		expect(await indexState()).toBeNull();
		expect(await reconcileNoteTextIndex(withIndex(false))).toBe('unchanged');

		expect(await reconcileNoteTextIndex(withIndex(true))).toBe('created');
		const created = await indexState();
		expect(created?.valid).toBe(true);
		expect(created?.def).toBe(fromMigration?.def);
		expect(await reconcileNoteTextIndex(withIndex(true))).toBe('unchanged');
	});

	// CONCURRENTLY の作成が中断されると無効な index が残り、検索には使われず書き込みの負担だけが続く。
	test('無効な index が残っていたら作り直す', async () => {
		await pool.unsafe(`UPDATE pg_index SET indisvalid = false WHERE indexrelid = '"IDX_NOTE_TEXT_TRGM"'::regclass`);
		expect((await indexState())?.valid).toBe(false);
		expect(await reconcileNoteTextIndex(withIndex(true))).toBe('created');
		expect((await indexState())?.valid).toBe(true);
	});
});
