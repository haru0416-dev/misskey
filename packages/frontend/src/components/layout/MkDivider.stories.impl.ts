/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';
import MkDivider from './MkDivider.vue';

export const Default = {
	render: (args) => ({
		components: { MkDivider },
		setup: () => ({ args }),
		template: '<MkDivider v-bind="args" />',
	}),
	args: {},
} satisfies StoryObj<typeof MkDivider>;
