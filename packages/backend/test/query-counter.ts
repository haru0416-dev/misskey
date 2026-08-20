/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiDrizzleDatabase } from '@/drizzle.js';

export type QueryCounter = {
	/** 直近の reset() 以降に発行されたSQLの本数 */
	count: () => number;
	reset: () => void;
	restore: () => void;
};

type PatchableClient = {
	query?: (...args: unknown[]) => unknown;
	unsafe?: (...args: unknown[]) => unknown;
};

/**
 * 実際に発行されたSQLの本数を数える。
 *
 * N+1 が無いことを確かめるテストは以前 `db.select()` の呼び出し回数で代用していたが、
 * 組み立て済みクエリを使い回すようになった (`@/db/prepared.js`) ため、ビルダの呼び出しは
 * 初回しか起きない。数えたいのはDB往復の回数なので、ドライバのクエリ発行メソッドを直接数える。
 *
 * ドライバはランタイムで変わる: node 実行時は node-postgres の Pool (`query`)、bun 実行時は
 * Bun.sql のラップ済みクライアント (`unsafe`, src/db/bun-sql.ts 参照)。どちらも drizzle の
 * `db.$client` から取れるため、存在する方のメソッドを差し替えて数える。
 * どちらのドライバでもトランザクション内のクエリは専用の接続/ネストクライアントを通るため
 * 数えない (従来の pool.query 版と同じ意味論)。
 *
 * クライアントを差し替えるので、`beforeAll` で1つだけ作り `afterAll` で `restore()` すること。
 */
export function countDatabaseQueries(db: MiDrizzleDatabase): QueryCounter {
	const client = (db as unknown as { $client: PatchableClient }).$client;
	const method = typeof client.unsafe === 'function' ? 'unsafe' : 'query';
	const original = client[method];
	if (typeof original !== 'function') {
		throw new Error('countDatabaseQueries: db.$client has neither unsafe() nor query()');
	}
	let count = 0;

	client[method] = function (this: PatchableClient, ...args: unknown[]): unknown {
		count++;
		return original.apply(this, args);
	};

	return {
		count: () => count,
		reset: () => {
			count = 0;
		},
		restore: () => {
			client[method] = original;
		},
	};
}
