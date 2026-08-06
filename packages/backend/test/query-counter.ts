/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiDrizzlePool } from '@/drizzle.js';

export type QueryCounter = {
	/** 直近の reset() 以降に発行されたSQLの本数 */
	count: () => number;
	reset: () => void;
	restore: () => void;
};

/**
 * 実際に発行されたSQLの本数を数える。
 *
 * N+1 が無いことを確かめるテストは以前 `db.select()` の呼び出し回数で代用していたが、
 * 組み立て済みクエリを使い回すようになった (`@/db/prepared.js`) ため、ビルダの呼び出しは
 * 初回しか起きない。数えたいのはDB往復の回数なので、プールの `query` を直接数える。
 *
 * プールを差し替えるので、`beforeAll` で1つだけ作り `afterAll` で `restore()` すること。
 */
export function countPoolQueries(pool: MiDrizzlePool): QueryCounter {
	const original = pool.query;
	let count = 0;

	pool.query = function (this: MiDrizzlePool, ...args: unknown[]): unknown {
		count++;
		return (original as (...queryArgs: unknown[]) => unknown).apply(this, args);
	} as typeof pool.query;

	return {
		count: () => count,
		reset: () => {
			count = 0;
		},
		restore: () => {
			pool.query = original;
		},
	};
}
