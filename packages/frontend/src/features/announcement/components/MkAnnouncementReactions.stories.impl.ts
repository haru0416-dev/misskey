/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { HttpResponse, http } from 'msw';
import type * as Misskey from 'misskey-js';
import type { StoryObj } from '@/stories/types.js';
import { expect, userEvent, waitFor, within } from '@/stories/test.js';
import MkAnnouncementReactions from './MkAnnouncementReactions.vue';
import { commonHandlers } from '@/stories/mocks.js';

const announcement: Misskey.entities.Announcement = {
	id: 'someannouncementid',
	title: 'Title',
	text: 'Text',
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: null,
	icon: 'info',
	imageUrl: null,
	display: 'normal',
	needConfirmationToRead: false,
	silence: false,
	forYou: false,
	reactions: { '👍': 2, '🎉': 1 },
	myReaction: '👍',
	isActive: true,
};

const calls: { endpoint: string; body: Record<string, unknown> }[] = [];

export const Default = {
	render(args) {
		return {
			components: {
				MkAnnouncementReactions,
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
			template: '<MkAnnouncementReactions v-bind="props" />',
		};
	},
	args: {
		announcement,
	},
	parameters: {
		layout: 'centered',
		msw: {
			handlers: [
				...commonHandlers,
				http.post('/api/announcements/unreact', async ({ request }) => {
					calls.push({ endpoint: 'unreact', body: (await request.json()) as Record<string, unknown> });
					return new HttpResponse(null, { status: 204 });
				}),
				http.post('/api/announcements/react', async ({ request }) => {
					calls.push({ endpoint: 'react', body: (await request.json()) as Record<string, unknown> });
					return new HttpResponse(null, { status: 204 });
				}),
			],
		},
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		const buttons = canvas.getAllByRole('button');

		// 自分が付けているものだけが押下状態。
		expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true');
		expect(buttons[1]?.getAttribute('aria-pressed')).toBe('false');
		await expect(buttons[0]).toHaveTextContent('2');

		// 別の絵文字を押すと、サーバーは 1 ユーザー 1 件なので付け替えになる。
		await userEvent.click(buttons[1]!);
		await waitFor(() => expect(calls.length).toBe(2));
		expect(calls.map((call) => call.endpoint)).toEqual(['unreact', 'react']);
		expect(calls[1]?.body['reaction']).toBe('🎉');
	},
} satisfies StoryObj<typeof MkAnnouncementReactions>;
