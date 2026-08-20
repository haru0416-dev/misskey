/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { runWriteTasks } from '../src/write-tasks.js';

describe('runWriteTasks', () => {
	test('rejects when any generated file write fails', async () => {
		let completedSlowWrite = false;
		const writeFile = vi.fn(async (file: string) => {
			if (file.endsWith('.css')) throw new Error('write failed');
			await Promise.resolve();
			completedSlowWrite = true;
		});

		await expect(runWriteTasks([
			() => writeFile('built/tabler-icons-frontend.woff2'),
			() => writeFile('built/tabler-icons-frontend.css'),
		])).rejects.toThrow('write failed');
		expect(writeFile).toHaveBeenCalledTimes(2);
		expect(completedSlowWrite).toBe(true);
	});
});
