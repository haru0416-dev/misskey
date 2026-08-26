/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';
import RouterView from './RouterView.vue';
import { createRouter } from '@/router.js';

export const Default = {
	render: (args) => ({
		components: { RouterView },
		setup: () => ({ args }),
		template: '<RouterView v-bind="args" />',
	}),
	args: {
		// router が無いと mount 時点で throw する。実物のルーターを渡す。
		router: createRouter('/about'),
	},
} satisfies StoryObj<typeof RouterView>;
