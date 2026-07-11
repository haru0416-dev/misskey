/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Meta, StoryObj } from '@storybook/vue3-vite';
import MkDataChart from './MkDataChart.vue';

const meta = {
	title: 'components/MkDataChart',
	component: MkDataChart,
	args: {
		ariaLabel: 'Sample activity chart',
		series: [
			{ name: 'Notes', type: 'area', data: [{ x: Date.now() - 3600000, y: 2 }, { x: Date.now(), y: 5 }] },
			{ name: 'Replies', type: 'bar', data: [{ x: Date.now() - 3600000, y: 1 }, { x: Date.now(), y: 2 }] },
		],
	},
} satisfies Meta<typeof MkDataChart>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
