/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, describe, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { nextTick, ref } from 'vue';
import { preferReactive, preferState } from './init';
import MkAnimBg from '@/components/display/MkAnimBg.vue';

vi.mock('chromatic/isChromatic', () => ({ default: () => false }));
vi.mock('@/utility/webgl.js', () => ({ initShaderProgram: () => ({}) }));

preferState.animation = true;
preferReactive.animation = ref(true);

describe('MkAnimBg', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		preferReactive.animation.value = true;
	});

	test('renders only while visible and animations are enabled', async () => {
		let intersectionCallback: IntersectionObserverCallback | undefined;
		const intersectionDisconnect = vi.fn();
		vi.stubGlobal(
			'IntersectionObserver',
			class {
				constructor(callback: IntersectionObserverCallback) {
					intersectionCallback = callback;
				}
				observe() {}
				disconnect() {
					intersectionDisconnect();
				}
			},
		);
		const resizeDisconnect = vi.fn();
		vi.stubGlobal(
			'ResizeObserver',
			class {
				observe() {}
				disconnect() {
					resizeDisconnect();
				}
			},
		);

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

		const gl = {
			ARRAY_BUFFER: 0,
			DYNAMIC_DRAW: 0,
			FLOAT: 0,
			TRIANGLE_STRIP: 0,
			COLOR_BUFFER_BIT: 0,
			clearColor: vi.fn(),
			clear: vi.fn(),
			createBuffer: vi.fn(() => ({})),
			bindBuffer: vi.fn(),
			useProgram: vi.fn(),
			getUniformLocation: vi.fn(() => ({})),
			uniform2fv: vi.fn(),
			uniform1f: vi.fn(),
			getAttribLocation: vi.fn(() => 0),
			enableVertexAttribArray: vi.fn(),
			vertexAttribPointer: vi.fn(),
			bufferData: vi.fn(),
			drawArrays: vi.fn(),
			viewport: vi.fn(),
		};
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(gl as unknown as WebGL2RenderingContext);

		const result = render(MkAnimBg);
		const canvas = result.container.querySelector('canvas');
		assert.ok(canvas instanceof HTMLCanvasElement);
		assert.equal(gl.drawArrays.mock.calls.length, 1);
		assert.equal(frames.size, 1);

		const widthReads = vi.spyOn(canvas, 'offsetWidth', 'get');
		const heightReads = vi.spyOn(canvas, 'offsetHeight', 'get');
		const [id, frame] = frames.entries().next().value!;
		frames.delete(id);
		frame(16);
		assert.equal(widthReads.mock.calls.length, 0);
		assert.equal(heightReads.mock.calls.length, 0);
		assert.equal(frames.size, 1);

		intersectionCallback?.([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
		assert.equal(frames.size, 0);
		intersectionCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
		assert.equal(frames.size, 1);

		preferReactive.animation.value = false;
		await nextTick();
		assert.equal(frames.size, 0);

		result.unmount();
		assert.equal(intersectionDisconnect.mock.calls.length, 1);
		assert.equal(resizeDisconnect.mock.calls.length, 1);
	});
});
