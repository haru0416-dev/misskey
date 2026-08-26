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
// 実時刻だと見るたび針が違うので、比較したいとき用に固定時刻の見た目も残す。
export const FixedTime = {
	...Default,
	args: {
		...Default.args,
		now: () => new Date('2023-01-01T10:10:30'),
	},
} satisfies StoryObj<typeof MkDigitalClock>;
