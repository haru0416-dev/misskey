/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent, h, ref } from 'vue';
import { useFormControlPadding } from '@/composables/useFormControlPadding.js';

describe('useFormControlPadding', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	test('updates only when decoration sizes change and disconnects on unmount', () => {
		const resizeCallbacks: ResizeObserverCallback[] = [];
		const observe = vi.fn();
		const disconnect = vi.fn();
		vi.stubGlobal(
			'ResizeObserver',
			class {
				constructor(callback: ResizeObserverCallback) {
					resizeCallbacks.push(callback);
				}

				observe = observe;
				disconnect = disconnect;
			},
		);
		const setInterval = vi.spyOn(window, 'setInterval');
		const Component = defineComponent({
			setup() {
				const input = ref<HTMLElement | null>(null);
				const prefix = ref<HTMLElement | null>(null);
				const suffix = ref<HTMLElement | null>(null);
				useFormControlPadding(input, prefix, suffix);
				return () =>
					h('div', [
						h('div', { ref: prefix, 'data-testid': 'prefix' }),
						h('div', { ref: input, 'data-testid': 'input' }),
						h('div', { ref: suffix, 'data-testid': 'suffix' }),
					]);
			},
		});

		const result = render(Component);
		const input = result.getByTestId('input');
		const prefix = result.getByTestId('prefix');
		const suffix = result.getByTestId('suffix');
		Object.defineProperty(prefix, 'offsetWidth', { configurable: true, value: 32 });
		Object.defineProperty(suffix, 'offsetWidth', { configurable: true, value: 24 });
		const resizeCallback = resizeCallbacks[0];
		assert(resizeCallback != null);
		resizeCallback([], {} as ResizeObserver);

		expect(input.style.paddingLeft).toBe('32px');
		expect(input.style.paddingRight).toBe('24px');
		expect(observe).toHaveBeenCalledTimes(2);
		expect(setInterval).not.toHaveBeenCalled();

		Object.defineProperty(prefix, 'offsetWidth', { configurable: true, value: 0 });
		Object.defineProperty(suffix, 'offsetWidth', { configurable: true, value: 0 });
		resizeCallback([], {} as ResizeObserver);
		expect(input.style.paddingLeft).toBe('');
		expect(input.style.paddingRight).toBe('');

		result.unmount();
		expect(disconnect).toHaveBeenCalledOnce();
	});
});
