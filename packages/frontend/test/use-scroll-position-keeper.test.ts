/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { render } from '@testing-library/vue';
import { defineComponent, ref } from 'vue';
import { useScrollPositionKeeper } from '@/composables/useScrollPositionKeeper.js';

describe('useScrollPositionKeeper', () => {
	test('removes listeners when the scroll container disappears', async () => {
		const Component = defineComponent({
			props: { show: { type: Boolean, required: true } },
			setup() {
				const container = ref<HTMLElement | null>(null);
				useScrollPositionKeeper(container);
				return { container };
			},
			template: '<div v-if="show" ref="container"></div>',
		});
		const result = render(Component, { props: { show: true } });
		const container = result.container.firstElementChild as HTMLElement;
		const removeEventListener = vi.spyOn(container, 'removeEventListener');

		await result.rerender({ show: false });

		expect(removeEventListener.mock.calls.some(([type]) => type === 'scroll')).toBe(true);
		expect(removeEventListener.mock.calls.some(([type]) => type === 'pointerdown')).toBe(true);
	});
});
