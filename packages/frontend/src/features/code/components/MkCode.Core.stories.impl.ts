/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';
import MkCode_core from './MkCode.Core.vue';

export const Default = {
	render: (args) => ({
		components: { MkCode_core },
		setup: () => ({ args }),
		template: '<MkCode_core v-bind="args" />',
	}),
	args: {},
} satisfies StoryObj<typeof MkCode_core>;
