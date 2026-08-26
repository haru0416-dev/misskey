/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { action } from '@/stories/action.js';
import type { StoryObj } from '@/stories/types.js';
import { http, HttpResponse } from 'msw';
import * as Misskey from 'misskey-js';
import MkDrive from './MkDrive.vue';
import { file, folder } from '@/stories/fakes.js';
import { commonHandlers } from '@/stories/mocks.js';
import { expect, userEvent, waitFor, within } from '@/stories/test.js';
import { i18n } from '@/i18n.js';

/** 絞り込みが実際に API へ渡るかを見るため、送られた本文を溜める。 */
const filesRequests: Record<string, unknown>[] = [];
export const Default = {
	render(args) {
		return {
			components: {
				MkDrive,
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
				events() {
					return {
						selected: action('selected'),
						'change-selection': action('change-selection'),
						'move-root': action('move-root'),
						cd: action('cd'),
						'open-folder': action('open-folder'),
					};
				},
			},
			template: '<MkDrive v-bind="props" v-on="events" />',
		};
	},
	parameters: {
		layout: 'centered',
		msw: {
			handlers: [
				...commonHandlers,
				http.post('/api/drive/files', async ({ request }) => {
					const body = await request.json();
					filesRequests.push(body as Record<string, unknown>);
					action('POST /api/drive/files')(body);
					return HttpResponse.json([file()]);
				}),
				http.post('/api/drive/folders', async ({ request }) => {
					action('POST /api/drive/folders')(await request.json());
					return HttpResponse.json([folder(crypto.randomUUID())]);
				}),
				http.post('/api/drive/folders/create', async ({ request }) => {
					const req = (await request.json()) as Misskey.entities.DriveFoldersCreateRequest;
					action('POST /api/drive/folders/create')(req);
					return HttpResponse.json(folder(crypto.randomUUID(), req.name, req.parentId));
				}),
				http.post('/api/drive/folders/delete', async ({ request }) => {
					action('POST /api/drive/folders/delete')(await request.json());
					return HttpResponse.json(undefined, { status: 204 });
				}),
				http.post('/api/drive/folders/update', async ({ request }) => {
					const req = (await request.json()) as Misskey.entities.DriveFoldersUpdateRequest;
					action('POST /api/drive/folders/update')(req);
					return HttpResponse.json({
						...folder(),
						id: req.folderId,
						name: req.name ?? folder().name,
						parentId: req.parentId ?? folder().parentId,
					});
				}),
			],
		},
	},
} satisfies StoryObj<typeof MkDrive>;

// 種類フィルターは props.type が無いときだけ出す。API 側は既に type を受けるので、
// UI が実際にその値を送るところまで見ないと配線の回帰を捕まえられない。
export const TypeFilter = {
	...Default,
	async play({ canvasElement }) {
		const canvas = within(canvasElement);

		await waitFor(() => expect(filesRequests.length).toBeGreaterThan(0));
		expect(filesRequests.at(-1), '既定では type を送らない').not.toHaveProperty('type');

		const before = filesRequests.length;
		await userEvent.click(canvas.getByRole('button', { name: i18n.ts.menu }));

		// メニューは transition 中の祖先が pointer-events: none を持ち、userEvent の
		// ポインタ検査を通せない。ここで見たいのは絞り込みが API へ渡る配線なので、
		// 実イベントを直接投げる (メニューの操作性は他の story が見ている)。
		// 親項目は preferClick でなければ mouseenter で子を開く。
		const menu = await canvas.findByRole('menu');
		const parent = within(menu).getByText(i18n.ts.type).closest('[role="menuitem"]');
		expect(parent, '種類の親項目').not.toBeNull();
		parent!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));

		const image = await canvas.findByText(i18n.ts.image);
		image.closest('[role="menuitem"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		await waitFor(() => expect(filesRequests.length).toBeGreaterThan(before));
		expect(filesRequests.at(-1)).toMatchObject({ type: 'image/*' });
	},
} satisfies StoryObj<typeof MkDrive>;
