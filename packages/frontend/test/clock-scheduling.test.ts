/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import './init';

const { idleAdd, idleDelete } = vi.hoisted(() => ({
	idleAdd: vi.fn(),
	idleDelete: vi.fn(),
}));

vi.mock('@/utility/idle-render.js', () => ({
	defaultIdlingRenderScheduler: {
		add: idleAdd,
		delete: idleDelete,
	},
}));

import MkDigitalClock from '@/components/MkDigitalClock.vue';

describe('clock component scheduling', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		idleAdd.mockClear();
		idleDelete.mockClear();
	});

	test('uses a second-boundary timer unless milliseconds are shown', async () => {
		let nextTimerId = 0;
		const setTimeout = vi.spyOn(window, 'setTimeout').mockImplementation(() => {
			return ++nextTimerId as unknown as ReturnType<typeof window.setTimeout>;
		});
		vi.spyOn(window, 'clearTimeout').mockImplementation(() => {});
		const now = () => new Date('2024-01-01T00:00:00.250Z');

		const result = render(MkDigitalClock, {
			props: {
				showMs: false,
				now,
			},
		});
		await nextTick();
		expect(setTimeout.mock.calls.some((call) => call[1] === 750)).toBe(true);
		expect(idleAdd).not.toHaveBeenCalled();

		await result.rerender({ showMs: true, now });
		expect(idleAdd).toHaveBeenCalledOnce();

		await result.rerender({ showMs: false, now });
		expect(idleDelete).toHaveBeenCalled();
		expect(setTimeout.mock.calls.filter((call) => call[1] === 750)).toHaveLength(2);

		result.unmount();
	});
});
