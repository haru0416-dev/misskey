/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { expect, userEvent, waitFor, within } from '@/stories/test.js';
import type { StoryObj } from '@/stories/types.js';
import { HttpResponse, http } from 'msw';
import { commonHandlers } from '@/stories/mocks.js';
import MkUrl from './MkUrl.vue';
export const Default = {
	render(args) {
		return {
			components: {
				MkUrl,
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
			template: '<MkUrl v-bind="props">Text</MkUrl>',
		};
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		const a = canvas.getByRole<HTMLAnchorElement>('link');
		await expect(a).toHaveAttribute('href', 'https://misskey-hub.net/');
		await waitFor(() => userEvent.hover(a));
		await waitFor(() => userEvent.unhover(a));
	},
	args: {
		url: 'https://misskey-hub.net/',
	},
	parameters: {
		layout: 'centered',
		msw: {
			handlers: [
				...commonHandlers,
				http.get('/url', () => {
					return HttpResponse.json({
						title: 'Misskey Hub',
						icon: 'https://misskey-hub.net/favicon.ico',
						description: 'Misskeyはオープンソースの分散型ソーシャルネットワーキングプラットフォームです。',
						thumbnail: null,
						player: {
							url: null,
							width: null,
							height: null,
							allow: [],
						},
						sitename: 'misskey-hub.net',
						sensitive: false,
						url: 'https://misskey-hub.net/',
					});
				}),
			],
		},
	},
} satisfies StoryObj<typeof MkUrl>;
