/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';
import MkEmojiPicker_section from './MkEmojiPicker.Section.vue';

export const Default = {
	render: (args) => ({
		components: { MkEmojiPicker_section },
		setup: () => ({ args }),
		template: '<MkEmojiPicker_section v-bind="args" />',
	}),
	args: {},
} satisfies StoryObj<typeof MkEmojiPicker_section>;
