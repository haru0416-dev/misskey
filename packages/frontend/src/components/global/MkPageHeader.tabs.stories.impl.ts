/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';
import MkPageHeader_tabs from './MkPageHeader.tabs.vue';

export const Default = {
	render: (args) => ({
		components: { MkPageHeader_tabs },
		setup: () => ({ args }),
		template: '<MkPageHeader_tabs v-bind="args" />',
	}),
	args: {},
} satisfies StoryObj<typeof MkPageHeader_tabs>;
