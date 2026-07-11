/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, describe, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { nextTick, ref } from 'vue';
import { preferReactive, preferState } from './init';
import MkNumber from '@/components/display/MkNumber.vue';

preferState.animation = true;
preferReactive.animation = ref(true);

describe('MkNumber', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		preferReactive.animation.value = true;
	});

	test('keeps only the latest animation frame loop and cancels it on unmount', async () => {
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

		const result = render(MkNumber, { props: { value: 100 } });
		assert.equal(frames.size, 1);

		const [firstId, firstFrame] = frames.entries().next().value!;
		frames.delete(firstId);
		firstFrame(0);
		assert.equal(frames.size, 1);

		await result.rerender({ value: 200 });
		assert.equal(frames.size, 1);

		const [secondId, secondFrame] = frames.entries().next().value!;
		frames.delete(secondId);
		secondFrame(100);
		assert.equal(frames.size, 1);
		const [lastId, lastFrame] = frames.entries().next().value!;
		frames.delete(lastId);
		lastFrame(600);
		await nextTick();
		assert.equal(result.getByText('200').textContent, '200');
		assert.equal(frames.size, 0);

		await result.rerender({ value: 300 });
		assert.equal(frames.size, 1);
		result.unmount();
		assert.equal(frames.size, 0);
	});

	test('updates immediately when animations are disabled', () => {
		preferReactive.animation.value = false;
		const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame');

		const result = render(MkNumber, { props: { value: 1234 } });

		assert.equal(result.getByText('1,234').textContent, '1,234');
		assert.equal(requestAnimationFrame.mock.calls.length, 0);
	});
});
