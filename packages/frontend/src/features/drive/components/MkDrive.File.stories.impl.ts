/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { action } from '@/stories/action.js';
import type { StoryObj } from '@/stories/types.js';
import MkDrive_file from './MkDrive.File.vue';
import { file } from '@/stories/fakes.js';
export const Default = {
	render(args) {
		return {
			components: {
				MkDrive_file,
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
						dragstart: action('dragstart'),
						dragend: action('dragend'),
					};
				},
			},
			template: '<MkDrive_file v-bind="props" v-on="events" />',
		};
	},
	args: {
		file: file(),
	},
	parameters: {
		chromatic: {
			// NOTE: ロードが終わるまで待つ
			delay: 3000,
		},
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkDrive_file>;
