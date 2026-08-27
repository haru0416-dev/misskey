/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';
import { expect, within } from '@/stories/test.js';
import { i18n } from '@/i18n.js';
import MkUserInfo from './MkUserInfo.vue';
import { userDetailed } from '@/stories/fakes.js';
import { commonHandlers } from '@/stories/mocks.js';

// story のログインアカウントは userDetailed() の既定 id なので、他人として別 id にする。
const other = userDetailed('otheruserid', 'someone', null, 'Someone');

export const Default = {
	render(args) {
		return {
			components: {
				MkUserInfo,
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
			template: '<MkUserInfo v-bind="props" />',
		};
	},
	args: {
		user: other,
	},
	parameters: {
		layout: 'centered',
		msw: {
			handlers: commonHandlers,
		},
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		await expect(canvas.queryByText(i18n.ts.followsYou)).toBeNull();
		await expect(canvas.queryByText(i18n.ts.mutualFollow)).toBeNull();
	},
} satisfies StoryObj<typeof MkUserInfo>;

export const FollowsYou = {
	...Default,
	args: {
		user: { ...other, isFollowed: true },
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		await expect(canvas.getByText(i18n.ts.followsYou)).toBeInTheDocument();
	},
} satisfies StoryObj<typeof MkUserInfo>;

export const Mutual = {
	...Default,
	args: {
		user: { ...other, isFollowed: true, isFollowing: true },
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		await expect(canvas.getByText(i18n.ts.mutualFollow)).toBeInTheDocument();
		await expect(canvas.queryByText(i18n.ts.followsYou)).toBeNull();
	},
} satisfies StoryObj<typeof MkUserInfo>;
