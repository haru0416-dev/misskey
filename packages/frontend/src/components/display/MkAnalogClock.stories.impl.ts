/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@/stories/types.js';
import MkAnalogClock from './MkAnalogClock.vue';
export const Default = {
	render(args) {
		return {
			components: {
				MkAnalogClock,
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
			template: '<MkAnalogClock v-bind="props" />',
		};
	},
	args: {},
	decorators: [
		() => ({
			template:
				'<div style="container-type:inline-size;height:100%"><div style="height:100cqmin;margin:auto;width:100cqmin"><story/></div></div>',
		}),
	],
	parameters: {
		layout: 'fullscreen',
	},
} satisfies StoryObj<typeof MkAnalogClock>;
// 実時刻だと見るたび針が違うので、比較したいとき用に固定時刻の見た目も残す。
export const FixedTime = {
	...Default,
	args: {
		...Default.args,
		now: () => new Date('2023-01-01T10:10:30'),
	},
} satisfies StoryObj<typeof MkAnalogClock>;
