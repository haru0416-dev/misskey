/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { render } from '@testing-library/vue';
import { defineComponent, ref } from 'vue';
import { useMutationObserver } from '@/composables/useMutationObserver.js';

describe('useMutationObserver', () => {
	test('disconnects the old target when its ref changes', async () => {
		const observe = vi.fn();
		const disconnect = vi.fn();
		vi.stubGlobal(
			'MutationObserver',
			class {
				public observe = observe;
				public disconnect = disconnect;
			},
		);
		const Component = defineComponent({
			props: { alternate: { type: Boolean, required: true } },
			setup() {
				const target = ref<HTMLElement | null>(null);
				useMutationObserver(target, { childList: true }, vi.fn());
				return { target };
			},
			template: '<div :key="alternate ? 1 : 0" ref="target"></div>',
		});
		const result = render(Component, { props: { alternate: false } });

		await result.rerender({ alternate: true });

		expect(observe).toHaveBeenCalledTimes(2);
		expect(disconnect).toHaveBeenCalledOnce();
		result.unmount();
		expect(disconnect).toHaveBeenCalledTimes(2);
		vi.unstubAllGlobals();
	});
});
