/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Returns a wrapper that runs the given async functions with a
 * bounded number of concurrent executions (replaces the
 * `promise-limit` package).
 */
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
