/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';
import MkDisableSection from './MkDisableSection.vue';

export const Default = {
	render: (args) => ({
		components: { MkDisableSection },
		setup: () => ({ args }),
		template: '<MkDisableSection v-bind="args" />',
	}),
	args: {},
} satisfies StoryObj<typeof MkDisableSection>;
