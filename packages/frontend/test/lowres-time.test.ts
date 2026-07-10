/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';

describe('lowres time', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	test('pauses updates while the document is hidden and refreshes on return', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000);

		let visibilityState: DocumentVisibilityState = 'visible';
		vi.spyOn(window.document, 'visibilityState', 'get').mockImplementation(() => visibilityState);
		vi.resetModules();

		const { lowresTime, TIME_UPDATE_INTERVAL } = await import('@/composables/useLowresTime.js');
		expect(lowresTime.value).toBe(1_000);

		vi.advanceTimersByTime(TIME_UPDATE_INTERVAL);
		expect(lowresTime.value).toBe(11_000);

		visibilityState = 'hidden';
		window.document.dispatchEvent(new Event('visibilitychange'));
		vi.advanceTimersByTime(TIME_UPDATE_INTERVAL * 2);
		expect(lowresTime.value).toBe(11_000);

		visibilityState = 'visible';
		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(lowresTime.value).toBe(31_000);

		vi.advanceTimersByTime(TIME_UPDATE_INTERVAL);
		expect(lowresTime.value).toBe(41_000);
	});
});
