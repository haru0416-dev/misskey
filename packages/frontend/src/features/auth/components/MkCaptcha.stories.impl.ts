/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';
import MkCaptcha from './MkCaptcha.vue';

export const Default = {
	render: (args) => ({
		components: { MkCaptcha },
		setup: () => ({ args }),
		template: '<MkCaptcha v-bind="args" />',
	}),
	args: {},
} satisfies StoryObj<typeof MkCaptcha>;
