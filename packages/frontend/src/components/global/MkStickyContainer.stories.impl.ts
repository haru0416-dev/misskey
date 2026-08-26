/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';
import MkStickyContainer from './MkStickyContainer.vue';

export const Default = {
	render: (args) => ({
		components: { MkStickyContainer },
		setup: () => ({ args }),
		template: '<MkStickyContainer v-bind="args" />',
	}),
	args: {},
} satisfies StoryObj<typeof MkStickyContainer>;
