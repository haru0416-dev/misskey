/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import type { Ref } from 'vue';
import { defineComponent, h, nextTick, ref } from 'vue';
import { useTooltip } from '@/composables/useTooltip.js';

describe('useTooltip', () => {
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	test('cleans up reactively without polling when the source element disappears', async () => {
		const setInterval = vi.spyOn(window, 'setInterval');
		vi.spyOn(window, 'setTimeout').mockImplementation((handler) => {
			if (typeof handler === 'function') handler();
			return 1 as unknown as ReturnType<typeof window.setTimeout>;
		});
		const sourceVisible = ref(true);
		let showing: Ref<boolean> | null = null;
		const onShow = vi.fn((value: Ref<boolean>) => {
			showing = value;
		});
		const Component = defineComponent({
			setup() {
				const source = ref<HTMLElement | null>(null);
				useTooltip(source, onShow, 0);
				return () => (sourceVisible.value ? h('button', { ref: source }) : null);
			},
		});

		const result = render(Component);
		await nextTick();
		const source = result.getByRole('button');
		source.dispatchEvent(new MouseEvent('mouseover'));

		expect(onShow).toHaveBeenCalledOnce();
		expect(showing).not.toBeNull();
		expect(showing!.value).toBe(true);
		expect(setInterval).not.toHaveBeenCalled();

		sourceVisible.value = false;
		await nextTick();
		expect(showing!.value).toBe(false);

		source.dispatchEvent(new MouseEvent('mouseover'));
		expect(onShow).toHaveBeenCalledOnce();

		result.unmount();
	});

	test('accepts mouse hover again after ignoring touch compatibility events', async () => {
		vi.useFakeTimers();
		const onShow = vi.fn();
		const Component = defineComponent({
			setup() {
				const source = ref<HTMLElement | null>(null);
				useTooltip(source, onShow, 0);
				return () => h('button', { ref: source });
			},
		});

		const result = render(Component);
		await nextTick();
		const source = result.getByRole('button');

		await fireEvent.touchStart(source);
		await fireEvent.touchEnd(source);
		source.dispatchEvent(new MouseEvent('mouseover'));
		await vi.runOnlyPendingTimersAsync();
		expect(onShow).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1000);
		source.dispatchEvent(new MouseEvent('mouseover'));
		await vi.runOnlyPendingTimersAsync();
		expect(onShow).toHaveBeenCalledOnce();
	});

	test('accepts mouse hover again after a cancelled touch', async () => {
		vi.useFakeTimers();
		const onShow = vi.fn();
		const Component = defineComponent({
			setup() {
				const source = ref<HTMLElement | null>(null);
				useTooltip(source, onShow, 0);
				return () => h('button', { ref: source });
			},
		});

		const result = render(Component);
		await nextTick();
		const source = result.getByRole('button');

		await fireEvent.touchStart(source);
		await fireEvent.touchCancel(source);
		source.dispatchEvent(new MouseEvent('mouseover'));
		await vi.runOnlyPendingTimersAsync();
		expect(onShow).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1000);
		source.dispatchEvent(new MouseEvent('mouseover'));
		await vi.runOnlyPendingTimersAsync();
		expect(onShow).toHaveBeenCalledOnce();
	});
});
