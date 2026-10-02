/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { allSettled, trackPromise, unrefDelay } from '@/misc/promise-tracker.js';

describe('promise-tracker', () => {
	test('allSettled は追跡中の Promise の決着を待つ', async () => {
		let settled = false;
		trackPromise(
			new Promise<void>((resolve) => setTimeout(resolve, 50)).then(() => {
				settled = true;
			}),
		);
		await allSettled();
		expect(settled).toBe(true);
	});

	test('allSettled は unrefDelay の満了を待たずに打ち切る', async () => {
		let ran = false;
		const pending = unrefDelay(2000).then(() => {
			ran = true;
		});
		trackPromise(pending.catch(() => {}));
		const started = performance.now();
		await allSettled();
		expect(performance.now() - started).toBeLessThan(500);
		await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
		expect(ran).toBe(false);
	});

	test('打ち切り後の unrefDelay は次の allSettled まで通常どおり満了する', async () => {
		await allSettled();
		await expect(unrefDelay(10)).resolves.toBeUndefined();
	});
});
