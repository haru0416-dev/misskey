/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { defineComponent } from 'vue';

const { popupMock } = vi.hoisted(() => ({
	popupMock: vi.fn(() => ({ dispose: vi.fn() })),
}));

vi.mock('@/os.js', () => ({
	popup: popupMock,
}));

vi.mock('@/preferences.js', () => ({
	prefer: { animation: true },
}));

import { animDirective } from '@/directives/anim.js';
import { appearDirective } from '@/directives/appear.js';
import { rippleDirective } from '@/directives/ripple.js';

describe('lightweight directives', () => {
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		popupMock.mockClear();
		vi.unstubAllGlobals();
	});

	test('removes the ripple click listener on unmount', async () => {
		const Component = defineComponent({ template: '<button v-ripple>Target</button>' });
		const result = render(Component, { global: { directives: { ripple: rippleDirective } } });
		const target = result.getByRole('button');

		await fireEvent.click(target);
		expect(popupMock).toHaveBeenCalledOnce();
		result.unmount();
		await fireEvent.click(target);
		expect(popupMock).toHaveBeenCalledOnce();
	});

	test('cancels its pending animation update on unmount', async () => {
		vi.useFakeTimers();
		const Component = defineComponent({ template: '<div v-anim>Target</div>' });
		const result = render(Component, { global: { directives: { anim: animDirective } } });
		const target = result.getByText('Target');

		expect(target.style.opacity).toBe('0');
		result.unmount();
		await vi.runAllTimersAsync();
		expect(target.style.opacity).toBe('0');
	});

	test('cancels a throttled appear callback on unmount', async () => {
		vi.useFakeTimers();
		let observerCallback!: IntersectionObserverCallback;
		const disconnect = vi.fn();
		vi.stubGlobal('IntersectionObserver', class {
			constructor(callback: IntersectionObserverCallback) {
				observerCallback = callback;
			}

			public observe() {}
			public disconnect = disconnect;
		});
		const onAppear = vi.fn();
		const Component = defineComponent({
			setup: () => ({ onAppear }),
			template: '<div v-appear="onAppear" />',
		});
		const result = render(Component, { global: { directives: { appear: appearDirective } } });
		const entries = [{ isIntersecting: true }] as IntersectionObserverEntry[];

		observerCallback(entries, {} as IntersectionObserver);
		observerCallback(entries, {} as IntersectionObserver);
		const callsBeforeUnmount = onAppear.mock.calls.length;
		result.unmount();
		await vi.runAllTimersAsync();

		expect(disconnect).toHaveBeenCalledOnce();
		expect(onAppear).toHaveBeenCalledTimes(callsBeforeUnmount);
	});
});
