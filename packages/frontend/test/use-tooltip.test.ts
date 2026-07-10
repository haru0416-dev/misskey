/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import type { Ref } from 'vue';
import { defineComponent, h, nextTick, ref } from 'vue';
import { useTooltip } from '@/composables/useTooltip.js';

describe('useTooltip', () => {
	afterEach(() => {
		cleanup();
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
				return () => sourceVisible.value ? h('button', { ref: source }) : null;
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
});
