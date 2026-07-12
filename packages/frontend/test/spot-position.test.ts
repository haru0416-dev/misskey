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
		left: '10',
		top: '20',
	})),
}));

vi.mock('@/os.js', () => ({
	claimZIndex: () => 1,
}));

vi.mock('@/utility/popup-position.js', () => ({
	calcPopupPosition: calcPopupPositionMock,
}));

import MkSpot from '@/components/overlay/MkSpot.vue';

describe('MkSpot', () => {
	afterEach(() => {
		cleanup();
		document.body.replaceChildren();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		calcPopupPositionMock.mockClear();
	});

	test('updates once per layout event instead of continuously polling', async () => {
		const resizeCallbacks: ResizeObserverCallback[] = [];
		const observe = vi.fn();
		const unobserve = vi.fn();
		const disconnect = vi.fn();
		vi.stubGlobal(
			'ResizeObserver',
			class {
				constructor(callback: ResizeObserverCallback) {
					resizeCallbacks.push(callback);
				}

				observe = observe;
				unobserve = unobserve;
				disconnect = disconnect;
			},
		);
		let nextFrameId = 0;
		const frames = new Map<number, FrameRequestCallback>();
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
			const id = ++nextFrameId;
			frames.set(id, callback);
			return id;
		});
		vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
			frames.delete(id);
		});
		const anchor = document.createElement('button');
		document.body.append(anchor);

		const result = render(MkSpot, {
			props: {
				title: 'title',
				description: 'description',
				anchorElement: anchor,
				hasPrev: false,
				hasNext: false,
			},
			global: {
				stubs: { MkButton: true },
			},
		});
		await nextTick();
		expect(frames.size).toBe(1);
		let frame = frames.entries().next().value!;
		frames.delete(frame[0]);
		frame[1](16);
		expect(calcPopupPositionMock).toHaveBeenCalledOnce();
		expect(frames.size).toBe(0);

		window.dispatchEvent(new Event('scroll'));
		window.dispatchEvent(new Event('scroll'));
		expect(frames.size).toBe(1);
		frame = frames.entries().next().value!;
		frames.delete(frame[0]);
		frame[1](32);
		expect(calcPopupPositionMock).toHaveBeenCalledTimes(2);
		expect(frames.size).toBe(0);

		const resizeCallback = resizeCallbacks[0];
		assert(resizeCallback != null);
		resizeCallback([], {} as ResizeObserver);
		expect(frames.size).toBe(1);

		const nextAnchor = document.createElement('button');
		document.body.append(nextAnchor);
		await result.rerender({
			title: 'title',
			description: 'description',
			anchorElement: nextAnchor,
			hasPrev: false,
			hasNext: false,
		});
		expect(unobserve).toHaveBeenCalledWith(anchor);
		expect(observe).toHaveBeenCalledWith(nextAnchor);

		result.unmount();
		expect(disconnect).toHaveBeenCalledOnce();
		expect(frames.size).toBe(0);
	});
});
