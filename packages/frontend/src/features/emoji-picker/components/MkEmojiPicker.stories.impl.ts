/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { action } from '@/stories/action.js';
import { expect, userEvent, waitFor, within } from '@/stories/test.js';
import type { StoryObj } from '@/stories/types.js';
import { i18n } from '@/i18n.js';
import MkEmojiPicker from './MkEmojiPicker.vue';
export const Default = {
	render(args) {
		return {
			components: {
				MkEmojiPicker,
			},
			setup() {
				return {
					args,
				};
			},
			computed: {
				props() {
					return {
						...this.args,
					};
				},
				events() {
					return {
						chosen: action('chosen'),
					};
				},
			},
			template: '<MkEmojiPicker v-bind="props" v-on="events" />',
		};
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		const faceSection = canvas.getByText(/face/i);
		await waitFor(() => userEvent.click(faceSection));
		const grinning = canvasElement.querySelector('[data-emoji="😀"]');
		await expect(grinning).toBeInTheDocument();
		if (grinning == null) throw new Error(); // expect の後でも型が絞り込まれないための到達不能ガード。
		await waitFor(() => userEvent.click(grinning));
		const recentUsedSection = canvas.getByText(new RegExp(i18n.ts.recentUsed)).parentElement;
		await expect(recentUsedSection).toBeInTheDocument();
		if (recentUsedSection == null) throw new Error(); // expect の後でも型が絞り込まれないための到達不能ガード。
		await expect(within(recentUsedSection).getByAltText('😀')).toBeInTheDocument();
		await expect(within(recentUsedSection).queryByAltText('😬')).toEqual(null);
	},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkEmojiPicker>;
