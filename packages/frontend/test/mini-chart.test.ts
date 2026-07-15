/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent, h, nextTick, ref } from 'vue';
import './init';

vi.mock('@/theme.js', () => ({
	themeManager: {
		currentCompiledTheme: {
			accent: '#86b300',
		},
	},
}));

import MkMiniChart from '@/features/charts/components/MkMiniChart.vue';

describe('MkMiniChart', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	test('redraws on an in-place data update without polling', async () => {
		const setInterval = vi.spyOn(window, 'setInterval');
		const values = ref([1, 2, 3]);
		const Component = defineComponent({
			setup() {
				return () => h(MkMiniChart, { src: values.value });
			},
		});

		const result = render(Component);
		const polyline = result.container.querySelector('polyline');
		expect(polyline?.getAttribute('points')?.split(' ')).toHaveLength(3);

		values.value.push(4);
		await nextTick();
		expect(polyline?.getAttribute('points')?.split(' ')).toHaveLength(4);
		expect(setInterval).not.toHaveBeenCalled();
	});

	test('does not draw chart marks for an empty series', () => {
		const result = render(MkMiniChart, { props: { src: [] } });

		expect(result.container.querySelector('polygon')).toBeNull();
		expect(result.container.querySelector('polyline')).toBeNull();
		expect(result.container.querySelector('circle')).toBeNull();
	});
});
