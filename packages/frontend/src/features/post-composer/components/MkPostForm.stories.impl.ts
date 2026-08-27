/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { nextTick } from 'vue';
import type { StoryObj } from '@/stories/types.js';
import { expect, userEvent, waitFor, within } from '@/stories/test.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import MkPostForm from './MkPostForm.vue';
import { commonHandlers } from '@/stories/mocks.js';

/** instance は全 story で共有される 1 つの reactive なので、触ったら必ず戻す。 */
async function withServerRules(run: () => Promise<void>): Promise<void> {
	const original = instance.serverRules;
	instance.serverRules = ['他人を尊重すること'];
	try {
		await nextTick();
		await run();
	} finally {
		instance.serverRules = original;
	}
}

export const Default = {
	render(args) {
		return {
			components: {
				MkPostForm,
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
			template: '<MkPostForm v-bind="props" />',
		};
	},
	args: {
		mock: true,
	},
	parameters: {
		layout: 'fullscreen',
		msw: {
			handlers: commonHandlers,
		},
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		// CW もファイルも無ければ、ルールがあっても出さない。
		await withServerRules(async () => {
			await expect(canvas.queryByRole('button', { name: i18n.ts.serverRules })).toBeNull();
		});
	},
} satisfies StoryObj<typeof MkPostForm>;

export const ServerRulesOnCw = {
	...Default,
	args: {
		mock: true,
		initialCw: '注意',
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		await withServerRules(async () => {
			const button = await waitFor(() => canvas.getByRole('button', { name: i18n.ts.serverRules }));
			await userEvent.click(button);
			await waitFor(() => expect(canvas.getByText('他人を尊重すること')).toBeInTheDocument());
		});
	},
} satisfies StoryObj<typeof MkPostForm>;
