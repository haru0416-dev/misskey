/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@/stories/types.js';
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
	args: {},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkDigitalClock>;
// 時刻表示を比較できるよう、現在時刻に依存しない story を用意する。
export const FixedTime = {
	...Default,
	args: {
		...Default.args,
		now: () => new Date('2023-01-01T10:10:30'),
	},
} satisfies StoryObj<typeof MkDigitalClock>;
