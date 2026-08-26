/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';
import MkEmojiPickerSection from './MkEmojiPicker.Section.vue';

export const Default = {
	render: (args) => ({
		components: { MkEmojiPickerSection },
		setup: () => ({ args }),
		template: '<MkEmojiPickerSection v-bind="args">セクション</MkEmojiPickerSection>',
	}),
	args: {
		emojis: ['👍', '❤️', '😆', '🎉'],
		initialShown: true,
	},
} satisfies StoryObj<typeof MkEmojiPickerSection>;
