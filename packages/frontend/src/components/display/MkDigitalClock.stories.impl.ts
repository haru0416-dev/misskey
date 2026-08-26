/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import isChromatic from '@/utility/is-chromatic.js';
import MkDigitalClock from './MkDigitalClock.vue';
export const Default = {
	render(args) {
		return {
			components: {
				MkDigitalClock,
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
			},
			template: '<MkDigitalClock v-bind="props" />',
		};
	},
	args: isChromatic() ? { now: () => new Date('2023-01-01T10:10:30') } : {},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkDigitalClock>;
