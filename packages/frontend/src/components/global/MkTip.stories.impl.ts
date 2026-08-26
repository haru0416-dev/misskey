/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';
import MkTip from './MkTip.vue';

export const Default = {
	render: (args) => ({
		components: { MkTip },
		setup: () => ({ args }),
		template: '<MkTip v-bind="args" />',
	}),
	args: {},
} satisfies StoryObj<typeof MkTip>;
