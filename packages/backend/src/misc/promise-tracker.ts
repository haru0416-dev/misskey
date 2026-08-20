/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const promiseRefs: Set<WeakRef<Promise<unknown>>> = new Set();

/** 他モジュールが待機しない Promise を追跡し、サーバー終了前にすべて settle させる。 */
export function trackPromise(promise: Promise<unknown>) {
	if (process.env['NODE_ENV'] !== 'test') {
		return;
	}
	const ref = new WeakRef(promise);
	promiseRefs.add(ref);
	promise.finally(() => promiseRefs.delete(ref)).catch(() => {});
}

export async function allSettled(): Promise<void> {
	// WeakRef.deref() は回収済みなら undefined を返すので、Promise だけを渡す
	await Promise.allSettled([...promiseRefs].map((r) => r.deref()).filter((p) => p != null));
}
