/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { AsyncLocalStorage } from 'node:async_hooks';

// HTTP リクエストまたは background task / queue attempt ごとに独立した memo。
const storage = new AsyncLocalStorage<Map<string, Promise<unknown>>>();

export function runInRequestScope<T>(fn: () => T): T {
	return storage.run(new Map(), fn);
}

/**
 * runtime の構築時に作り、呼出元の HTTP context ではなく runtime 側で task を実行する。
 * snapshot に既存 memo を保持させず、同じ runner の各実行にも新しい memo を割り当てる。
 */
export function createBackgroundExecutionScope(): <T>(task: () => T) => T {
	const runInRuntimeScope = storage.exit(() => AsyncLocalStorage.snapshot());
	return <T>(task: () => T): T => runInRuntimeScope(runInRequestScope, task);
}

/**
 * `key` につき1回だけ `compute()` を走らせ、同一スコープ内では結果を使い回す。
 * スコープの外では素通しで毎回計算する。
 */
export function memoizeInRequest<T>(key: string, compute: () => Promise<T>): Promise<T> {
	const store = storage.getStore();
	if (store == null) {
		return compute();
	}

	const cached = store.get(key);
	if (cached != null) {
		return cached as Promise<T>;
	}

	const promise = compute();
	store.set(key, promise);

	return promise;
}
