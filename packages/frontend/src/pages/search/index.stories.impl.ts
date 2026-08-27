/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';
import { HttpResponse, http } from 'msw';
import { expect, userEvent, waitFor, within } from '@/stories/test.js';
import { i18n } from '@/i18n.js';
import search_ from './index.vue';
import { userDetailed } from '@/stories/fakes.js';
import { commonHandlers } from '@/stories/mocks.js';

const localUser = userDetailed('someuserid', 'miskist', null, 'Local Misskey User');

export const Default = {
	render(args) {
		return {
			components: {
				search_,
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
			template: '<search_ v-bind="props" />',
		};
	},
	args: {
		ignoreNotesSearchAvailable: true,
	},
	parameters: {
		layout: 'fullscreen',
		msw: {
			handlers: [
				...commonHandlers,
				http.post('/api/users/show', () => {
					return HttpResponse.json(userDetailed());
				}),
				http.post('/api/users/search', () => {
					return HttpResponse.json([userDetailed(), localUser]);
				}),
			],
		},
	},
} satisfies StoryObj<typeof search_>;

export const NoteSearchDisabled = {
	...Default,
	args: {},
} satisfies StoryObj<typeof search_>;

export const WithUsernameLocal = {
	...Default,

	args: {
		...Default.args,
		username: localUser.username,
		host: localUser.host,
	},
	parameters: {
		layout: 'fullscreen',
		msw: {
			handlers: [
				...commonHandlers,
				http.post('/api/users/show', () => {
					return HttpResponse.json(localUser);
				}),
				http.post('/api/users/search', () => {
					return HttpResponse.json([userDetailed(), localUser]);
				}),
			],
		},
	},
} satisfies StoryObj<typeof search_>;

export const WithUserType = {
	...Default,
	args: {
		type: 'user',
	},
} satisfies StoryObj<typeof search_>;

const searchByTagRequests: Record<string, unknown>[] = [];

export const WithHashtagType = {
	...Default,
	args: {
		type: 'hashtag',
	},
	parameters: {
		...Default.parameters,
		msw: {
			handlers: [
				...commonHandlers,
				http.post('/api/notes/search-by-tag', async ({ request }) => {
					searchByTagRequests.push((await request.json()) as Record<string, unknown>);
					return HttpResponse.json([]);
				}),
			],
		},
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);

		// 先頭の `#` と全角空白を落として AND 条件 1 組に畳むところまでを見る。
		await userEvent.type(await canvas.findByRole('searchbox'), '#猫\u3000写真');
		await userEvent.click(canvas.getByRole('button', { name: i18n.ts.search }));

		await waitFor(() => expect(searchByTagRequests.length).toBeGreaterThan(0));
		expect(searchByTagRequests.at(-1)?.['query']).toEqual([['猫', '写真']]);
	},
} satisfies StoryObj<typeof search_>;
