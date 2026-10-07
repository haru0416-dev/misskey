/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { runWriteTasks } from '../src/write-tasks.js';

describe('runWriteTasks', () => {
	test('一つが失敗しても残りの書き込みの完了を待ってから失敗を返す', async () => {
		// 遅い書き込みの完了はテストが決める。待たずに返すと、書きかけのファイルを残したままビルドが終わる。
		const slowWrite = Promise.withResolvers<void>();
		let completedSlowWrite = false;
		const writeFile = vi.fn(async (file: string) => {
			if (file.endsWith('.css')) {
				throw new Error('write failed');
			}
			await slowWrite.promise;
			completedSlowWrite = true;
		});

		let settled = false;
		const running = runWriteTasks([
			() => writeFile('built/tabler-icons-frontend.woff2'),
			() => writeFile('built/tabler-icons-frontend.css'),
		]);
		running.then(
			() => (settled = true),
			() => (settled = true),
		);

		// 失敗した書き込みの reject と、それに続く処理が全て終わる macrotask まで待つ。
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(writeFile).toHaveBeenCalledTimes(2);
		expect(settled).toBe(false);

		slowWrite.resolve();
		await expect(running).rejects.toThrow('write failed');
		expect(completedSlowWrite).toBe(true);
	});

	test('全て成功すれば解決する', async () => {
		const written: string[] = [];
		await expect(
			runWriteTasks([
				async () => written.push('a'),
				async () => written.push('b'),
			]),
		).resolves.toBeUndefined();
		expect(written).toEqual(['a', 'b']);
	});
});
