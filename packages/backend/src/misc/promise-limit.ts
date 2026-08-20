/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** 非同期関数の同時実行数を制限する wrapper を返す。 */
export function promiseLimit<T>(concurrency: number): (fn: () => PromiseLike<T> | T) => Promise<T> {
	let active = 0;
	const queue: (() => void)[] = [];

	function next(): void {
		active--;
		queue.shift()?.();
	}

	return (fn) =>
		new Promise<T>((resolve, reject) => {
			function run(): void {
				active++;
				Promise.resolve().then(fn).then(resolve, reject).finally(next);
			}
			if (active < concurrency) {
				run();
			} else {
				queue.push(run);
			}
		});
}
