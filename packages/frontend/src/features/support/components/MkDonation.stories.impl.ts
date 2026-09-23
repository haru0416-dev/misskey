/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { action } from '@/stories/action.js';
import type { StoryObj } from '@/stories/types.js';
import { onBeforeUnmount } from 'vue';
import MkDonation from './MkDonation.vue';
import { instance, updateInstance } from '@/instance.js';
export const Default = {
	render(args) {
		return {
			components: {
				MkDonation,
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
						closed: action('closed'),
					};
				},
			},
			template: '<MkDonation v-bind="props" v-on="events" />',
		};
	},
	args: {
		name: 'Misskey Hub',
	},
	decorators: [
		(_, { args }) => ({
			setup() {
				const name = instance.name;
				updateInstance({ name: args['name'] as string | null });
				onBeforeUnmount(() => updateInstance({ name }));
			},
			template: '<story/>',
		}),
	],
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkDonation>;
