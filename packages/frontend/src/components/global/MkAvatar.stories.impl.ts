/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@/stories/types.js';
import { userDetailed } from '@/stories/fakes.js';
import MkAvatar from './MkAvatar.vue';
const common = {
	render(args) {
		return {
			components: {
				MkAvatar,
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
			template: '<MkAvatar v-bind="props" />',
		};
	},
	args: {
		user: userDetailed(),
	},
	decorators: [
		(Story, context) => ({
			// @ts-expect-error size is for test
			template: `<div :style="{ display: 'grid', width: '${context.args.size}px', height: '${context.args.size}px' }"><story/></div>`,
		}),
	],
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkAvatar>;
export const ProfilePage = {
	...common,
	args: {
		...common.args,
		size: 120,
		indicator: true,
	},
} satisfies StoryObj<typeof MkAvatar>;
export const ProfilePageCat = {
	...ProfilePage,
	args: {
		...ProfilePage.args,
		user: {
			...userDetailed(),
			isCat: true,
		},
	},
	parameters: {
		...ProfilePage.parameters,
		chromatic: {
			/* 5,504,893x5,504,892px となり、Chromatic の 25,000,000px 制限を超えるため撮影しない。
			 * 解消するにはページのコンポーネント分割か、大きな要素数の削減が必要。
			 */
			disableSnapshot: true,
		},
	},
} satisfies StoryObj<typeof MkAvatar>;
