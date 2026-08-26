/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';
import MkDriveWindow from './MkDriveWindow.vue';

export const Default = {
	render: (args) => ({
		components: { MkDriveWindow },
		setup: () => ({ args }),
		template: '<MkDriveWindow v-bind="args" />',
	}),
	args: {},
} satisfies StoryObj<typeof MkDriveWindow>;
