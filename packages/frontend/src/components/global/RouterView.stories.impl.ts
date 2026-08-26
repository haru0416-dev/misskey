/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';
import RouterView from './RouterView.vue';

export const Default = {
	render: (args) => ({
		components: { RouterView },
		setup: () => ({ args }),
		template: '<RouterView v-bind="args" />',
	}),
	args: {},
} satisfies StoryObj<typeof RouterView>;
