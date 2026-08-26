/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';
import MkLazy from './MkLazy.vue';

export const Default = {
	render: (args) => ({
		components: { MkLazy },
		setup: () => ({ args }),
		template: '<MkLazy v-bind="args" />',
	}),
	args: {},
} satisfies StoryObj<typeof MkLazy>;
