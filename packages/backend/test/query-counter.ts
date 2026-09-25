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
	unsafe: (...args: unknown[]) => unknown;
};

/**
 * 組み立て済みクエリではビルダの呼び出し回数と DB 往復回数が一致しないため、Bun SQL の `unsafe` を差し替えて
 * ドライバのクエリ発行を数える。transaction 内は専用クライアントを通るため数えない。
 * クライアントを差し替えるので、`beforeAll` で 1 つだけ作り `afterAll` で `restore()` すること。
 */
export function countDatabaseQueries(db: MiDrizzleDatabase): QueryCounter {
	const client = (db as unknown as { $client: PatchableClient }).$client;
	const original = client.unsafe;
	let count = 0;

	client.unsafe = function (this: PatchableClient, ...args: unknown[]): unknown {
		count++;
		return original.apply(this, args);
	};

	return {
		count: () => count,
		reset: () => {
			count = 0;
		},
		restore: () => {
			client.unsafe = original;
		},
	};
}
