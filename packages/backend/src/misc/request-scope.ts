/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * 1リクエストの間だけ生きる memo。
 *
 * 同じリクエストの中で同じ問い合わせを何度も投げている箇所がある (例: ロールの解決は
 * users/show と notes/create でそれぞれ3回)。SQL 1本には行数によらない固定CPU
 * (プール貸出、RowDescription 処理、結果オブジェクトの構築) がかかるので、
 * 本数を減らすこと自体に効果がある。
 *
 * リクエストをまたがないので陳腐化しない。DB を直接書き換えるテストとも競合しない
 * (プロセスをまたぐキャッシュはこのリポジトリのe2e構成では成立しない)。
 */
const storage = new AsyncLocalStorage<Map<string, Promise<unknown>>>();

export function runInRequestScope<T>(fn: () => T): T {
	return storage.run(new Map(), fn);
}

/**
 * `key` につき1回だけ `compute()` を走らせ、同一リクエスト内では結果を使い回す。
 * スコープの外 (キューワーカー等) では素通しで毎回計算する。
 */
export function memoizeInRequest<T>(key: string, compute: () => Promise<T>): Promise<T> {
	const store = storage.getStore();
	if (store == null) return compute();

	const cached = store.get(key);
	if (cached != null) return cached as Promise<T>;

	const promise = compute();
	store.set(key, promise);

	return promise;
}
