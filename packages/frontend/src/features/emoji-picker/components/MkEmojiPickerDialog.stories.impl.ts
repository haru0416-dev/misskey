/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';
import MkEmojiPickerDialog from './MkEmojiPickerDialog.vue';

export const Default = {
	render: (args) => ({
		components: { MkEmojiPickerDialog },
		setup: () => ({ args }),
		template: '<MkEmojiPickerDialog v-bind="args" />',
	}),
	args: {},
} satisfies StoryObj<typeof MkEmojiPickerDialog>;
