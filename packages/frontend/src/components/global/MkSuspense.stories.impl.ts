/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';
import MkSuspense from './MkSuspense.vue';

export const Default = {
	render: (args) => ({
		components: { MkSuspense },
		setup: () => ({ args }),
		template: '<MkSuspense v-bind="args" />',
	}),
	args: {},
} satisfies StoryObj<typeof MkSuspense>;
