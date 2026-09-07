/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Query } from 'drizzle-orm';
import type { MiDrizzleDatabase } from '@/drizzle.js';

/**
 * drizzle のクエリビルダは `execute()` のたびに SQL 文字列を組み立て直す。
 * このコストは選択列数にほぼ比例し、実測で `db.select().from(user)` (42列) が 167µs/回、
 * `db.select().from(note)` (34列) が 227µs/回。DB 往復そのもの (無負荷で約 180µs) と
 * 同程度の CPU を毎リクエスト焼いており、CPUプロファイル上は
 * notes/timeline の総CPU 7.49ms/req のうち 39.6% がこの組み立てだった。
 *
 * 組み立て済みの prepared query は `db` インスタンスに紐づくので、
 * トランザクション用の db (別インスタンス) と混ざらないよう WeakMap で分けて保持する。
 * トランザクションの db は短命だが、WeakMap なので放置してよい。
 */
const preparedQueriesByDatabase = new WeakMap<object, Map<string, unknown>>();

/**
 * `.prepare(name)` に渡し、SQL の組み立て結果だけを再利用しつつ PostgreSQL では無名文として実行させる。
 * 名前付き文はホームタイムラインの `= ANY($n)` でジェネリックプランを選び得て、
 * 実測で 1.37 ms から 146.6 ms へ悪化する。
 */
export const UNNAMED_PREPARED_STATEMENT = undefined as unknown as string;

/**
 * `key` ごとに一度だけ `build()` を呼び、以後は組み立て済みのものを返す。
 * `key` は SQL の形ごとに一意にすること (条件の有無で形が変わるなら key にも含める)。
 */
export function preparedQueryFor<T>(db: MiDrizzleDatabase, key: string, build: () => T): T {
	let queries = preparedQueriesByDatabase.get(db);

	if (queries === undefined) {
		queries = new Map<string, unknown>();
		preparedQueriesByDatabase.set(db, queries);
	}

	const cached = queries.get(key);
	if (cached !== undefined) {
		return cached as T;
	}

	const built = build();
	queries.set(key, built);

	return built;
}

/**
 * 書き込み (insert / update / delete) の組み立て結果。SQL 文字列と placeholder の並びは
 * 接続に依存しないので db インスタンスではなく key だけで保持する。
 */
const preparedStatementQueriesByKey = new Map<string, Query>();

/**
 * トランザクション内でも組み立て結果を使い回す書き込み用。
 *
 * `preparedQueryFor` は db インスタンスごとに保持するが、`db.transaction()` の tx は毎回別インスタンスなので、
 * トランザクション内の insert / update / delete は毎回組み立て直しになっていた (notes/create の note 挿入・
 * user 更新・outbox 挿入がこれに当たる)。ここでは `toSQL()` の結果を key 単位で保持し、実行時にその db の
 * session へ結び付け直す。名前無しなので PostgreSQL 側に prepared statement は残らない。
 *
 * 結果行のマッピング (fields) を通さないため、行を読む select には使わない。
 * placeholder に対応する値が `values` に無いと drizzle が例外を投げる。
 */
export async function executePreparedStatement(
	db: MiDrizzleDatabase,
	key: string,
	build: () => { toSQL(): Query },
	values: Record<string, unknown>,
): Promise<void> {
	let query = preparedStatementQueriesByKey.get(key);

	if (query === undefined) {
		query = build().toSQL();
		preparedStatementQueriesByKey.set(key, query);
	}

	await db._.session.prepareQuery(query, undefined, UNNAMED_PREPARED_STATEMENT, false).execute(values);
}
