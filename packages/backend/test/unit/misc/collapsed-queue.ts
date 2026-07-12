/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { CollapsedQueue } from '@/misc/collapsed-queue.js';

describe('CollapsedQueue', () => {
	test('reports timer callback failures without an unhandled rejection', async () => {
		vi.useFakeTimers();
		const error = new Error('failed');
		const onError = vi.fn();
		const queue = new CollapsedQueue(100, (_, value: number) => value, async () => {
			throw error;
		}, onError);

		queue.enqueue('key', 1);
		await vi.advanceTimersByTimeAsync(100);

		expect(onError).toHaveBeenCalledWith(error, 'key', 1);
		vi.useRealTimers();
	});

	test('reports failures while flushing queued jobs', async () => {
		const error = new Error('failed');
		const onError = vi.fn();
		const queue = new CollapsedQueue(100, (_, value: number) => value, async () => {
			throw error;
		}, onError);

		queue.enqueue('key', 1);
		await queue.performAllNow();

		expect(onError).toHaveBeenCalledWith(error, 'key', 1);
	});
});
