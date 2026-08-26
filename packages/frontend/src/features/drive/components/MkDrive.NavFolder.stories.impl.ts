/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';
import MkDrive_navFolder from './MkDrive.NavFolder.vue';

export const Default = {
	render: (args) => ({
		components: { MkDrive_navFolder },
		setup: () => ({ args }),
		template: '<MkDrive_navFolder v-bind="args" />',
	}),
	args: {},
} satisfies StoryObj<typeof MkDrive_navFolder>;
