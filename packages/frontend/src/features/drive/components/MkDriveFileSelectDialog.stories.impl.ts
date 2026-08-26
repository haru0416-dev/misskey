/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';
import MkDriveSelectDialog from './MkDriveFileSelectDialog.vue';

export const Default = {
	render: (args) => ({
		components: { MkDriveSelectDialog },
		setup: () => ({ args }),
		template: '<MkDriveSelectDialog v-bind="args" />',
	}),
	args: {},
} satisfies StoryObj<typeof MkDriveSelectDialog>;
