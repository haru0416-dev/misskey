/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';
import MkAuthConfirm from './MkAuthConfirm.vue';

export const Default = {
	render: (args) => ({
		components: { MkAuthConfirm },
		setup: () => ({ args }),
		template: '<MkAuthConfirm v-bind="args" />',
	}),
	args: {},
} satisfies StoryObj<typeof MkAuthConfirm>;
