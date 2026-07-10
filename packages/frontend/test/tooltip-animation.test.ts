/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import './init';

const { calcPopupPositionMock } = vi.hoisted(() => ({
	calcPopupPositionMock: vi.fn(() => ({
		transformOrigin: 'center',
		left: '0',
		top: '0',
	})),
}));

vi.mock('@/os.js', () => ({
	claimZIndex: () => 1,
}));

vi.mock('@/utility/popup-position.js', () => ({
	calcPopupPosition: calcPopupPositionMock,
}));

import MkTooltip from '@/components/MkTooltip.vue';

describe('MkTooltip', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		calcPopupPositionMock.mockClear();
	});

	test('tracks position only while shown in a visible document', async () => {
		let visibilityState: DocumentVisibilityState = 'visible';
		vi.spyOn(window.document, 'visibilityState', 'get').mockImplementation(() => visibilityState);

		let frameId = 0;
		const frames = new Map<number, FrameRequestCallback>();
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
			const id = ++frameId;
			frames.set(id, callback);
			return id;
		});
		vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
			frames.delete(id);
		});

		const result = render(MkTooltip, {
			props: {
				id: 'tooltip-test',
				showing: false,
				text: 'tooltip',
			},
		});
		await nextTick();
		expect(result.getByRole('tooltip', { hidden: true }).id).toBe('tooltip-test');
		expect(calcPopupPositionMock).not.toHaveBeenCalled();
		expect(frames.size).toBe(0);

		await result.rerender({ showing: true, text: 'tooltip' });
		await nextTick();
		expect(calcPopupPositionMock).toHaveBeenCalledOnce();
		expect(frames.size).toBe(1);

		const [id, frame] = frames.entries().next().value!;
		frames.delete(id);
		frame(16);
		expect(calcPopupPositionMock).toHaveBeenCalledTimes(2);
		expect(frames.size).toBe(1);

		visibilityState = 'hidden';
		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(frames.size).toBe(0);

		visibilityState = 'visible';
		window.document.dispatchEvent(new Event('visibilitychange'));
		await nextTick();
		expect(calcPopupPositionMock).toHaveBeenCalledTimes(3);
		expect(frames.size).toBe(1);

		await result.rerender({ showing: false, text: 'tooltip' });
		expect(frames.size).toBe(0);

		result.unmount();
		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(frames.size).toBe(0);
	});
});
