/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { HttpResponse, http } from 'msw';
import { action } from '@/stories/action.js';
import { expect, userEvent, waitFor, within } from '@/stories/test.js';
import { channel } from '@/stories/fakes.js';
import { commonHandlers } from '@/stories/mocks.js';
import MkChannelFollowButton from './MkChannelFollowButton.vue';
import type { StoryObj } from '@/stories/types.js';
import { i18n } from '@/i18n.js';

const requests: { endpoint: string; body: unknown }[] = [];

export const Default = {
	render(args) {
		return {
			components: {
				MkChannelFollowButton,
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
			template: '<MkChannelFollowButton v-bind="props" />',
		};
	},
	args: {
		channel: channel(),
		full: true,
	},
	async play({ canvasElement }) {
		requests.length = 0;
		const canvas = within(canvasElement);
		const buttonElement = canvas.getByRole<HTMLButtonElement>('button');
		// 「フォロー」は「フォロー解除」の部分文字列なので、部分一致では状態を区別できない。
		const label = () => buttonElement.textContent?.trim();
		await expect(label()).toBe(i18n.ts.follow);

		await userEvent.click(buttonElement);
		await waitFor(() => expect(label()).toBe(i18n.ts.unfollow));
		await expect(requests).toEqual([{ endpoint: 'channels/follow', body: { channelId: channel().id } }]);

		await userEvent.click(buttonElement);
		await waitFor(() => expect(label()).toBe(i18n.ts.follow));
		await expect(requests.map((request) => request.endpoint)).toEqual(['channels/follow', 'channels/unfollow']);
		await expect(requests[1]?.body).toEqual({ channelId: channel().id });
	},
	parameters: {
		layout: 'centered',
		msw: {
			handlers: [
				...commonHandlers,
				http.post('/api/channels/follow', async ({ request }) => {
					const body = await request.json();
					requests.push({ endpoint: 'channels/follow', body });
					action('POST /api/channels/follow')(body);
					return new HttpResponse(null, { status: 204 });
				}),
				http.post('/api/channels/unfollow', async ({ request }) => {
					const body = await request.json();
					requests.push({ endpoint: 'channels/unfollow', body });
					action('POST /api/channels/unfollow')(body);
					return new HttpResponse(null, { status: 204 });
				}),
			],
		},
	},
} satisfies StoryObj<typeof MkChannelFollowButton>;
