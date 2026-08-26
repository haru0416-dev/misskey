/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';
import MkContainer from './MkContainer.vue';

export const Default = {
	render: (args) => ({
		components: { MkContainer },
		setup: () => ({ args }),
		template: '<MkContainer v-bind="args" />',
	}),
	args: {},
} satisfies StoryObj<typeof MkContainer>;
