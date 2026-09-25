/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { setTimeout as delay } from 'node:timers/promises';

const promiseRefs = new Set<WeakRef<Promise<unknown>>>();
let shutdown = new AbortController();

/** 他モジュールが待機しない Promise を追跡し、サーバー終了前にすべて settle させる。 */
export function trackPromise(promise: Promise<unknown>) {
	if (process.env['NODE_ENV'] !== 'test') {
		return;
	}
	const ref = new WeakRef(promise);
	promiseRefs.add(ref);
	promise.finally(() => promiseRefs.delete(ref)).catch(() => {});
}

/**
 * プロセスを終了させない遅延。本番では終了時に満了を待たずに捨てられるので、テストでも allSettled で
 * 打ち切る (AbortError で reject する)。打ち切らないと e2e のファイルごとの再起動が満了まで最大 2 秒待つ。
 */
export function unrefDelay(ms: number): Promise<void> {
	return delay(ms, undefined, { ref: false, signal: shutdown.signal });
}

export async function allSettled(): Promise<void> {
	shutdown.abort();
	shutdown = new AbortController();
	// WeakRef.deref() は回収済みなら undefined を返すので、Promise だけを渡す
	await Promise.allSettled([...promiseRefs].map((r) => r.deref()).filter((p) => p != null));
}
