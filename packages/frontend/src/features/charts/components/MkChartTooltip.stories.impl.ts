/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';
import MkChartTooltip from './MkChartTooltip.vue';

export const Default = {
	render: (args) => ({
		components: { MkChartTooltip },
		setup: () => ({ args }),
		template: '<MkChartTooltip v-bind="args" />',
	}),
	args: {},
} satisfies StoryObj<typeof MkChartTooltip>;
