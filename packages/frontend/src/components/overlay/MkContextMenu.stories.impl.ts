/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, userEvent, within } from '@/stories/test.js';
import MkContextMenu from './MkContextMenu.vue';
import type { StoryObj } from '@/stories/types.js';
import * as os from '@/os.js';
export const Empty = {
	render(args) {
		return {
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
			methods: {
				onContextmenu(ev: PointerEvent) {
					os.contextMenu(args.items, ev);
				},
			},
			template: '<div @contextmenu.stop="onContextmenu">Right Click Here</div>',
		};
	},
	args: {
		items: [],
	},
	async play({ canvasElement, args }) {
		const canvas = within(canvasElement);
		const target = canvas.getByText('Right Click Here');
		await userEvent.pointer({ keys: '[MouseRight>]', target });

		// 右クリックしただけでは何も主張していない。メニューが開き、渡した項目が並ぶまで見る。
		// os.contextMenu は MkContextMenu を動的 import してから popup するので同期では取れない。
		const menu = await canvas.findByRole('menu');
		for (const item of args.items ?? []) {
			if (typeof item === 'object' && item != null && 'text' in item && typeof item.text === 'string') {
				await expect(menu).toHaveTextContent(item.text);
			}
		}
	},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkContextMenu>;
export const SomeTabs = {
	...Empty,
	args: {
		items: [
			{
				text: 'Home',
				icon: 'ti ti-home',
				action() {},
			},
		],
	},
} satisfies StoryObj<typeof MkContextMenu>;
