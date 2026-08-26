/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';
import MkAsUi from './MkAsUi.vue';

export const Default = {
	render: (args) => ({
		components: { MkAsUi },
		setup: () => ({ args }),
		template: '<MkAsUi v-bind="args" />',
	}),
	args: {},
} satisfies StoryObj<typeof MkAsUi>;
