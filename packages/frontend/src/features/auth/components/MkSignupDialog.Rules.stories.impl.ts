/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { expect, userEvent, waitFor, within } from '@/stories/test.js';
import type { StoryObj } from '@/stories/types.js';
import { onBeforeUnmount } from 'vue';
import MkSignupServerRules from './MkSignupDialog.Rules.vue';
import { i18n } from '@/i18n.js';
import { instance, updateInstance } from '@/instance.js';
export const Empty = {
	render(args) {
		return {
			components: {
				MkSignupServerRules,
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
			template: '<MkSignupServerRules v-bind="props" />',
		};
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		const groups = await canvas.findAllByRole('group');
		const buttons = await canvas.findAllByRole('button');
		for (const group of groups) {
			if (group.ariaExpanded === 'true') {
				continue;
			}
			const button = await within(group).findByRole('button');
			userEvent.click(button);
			await waitFor(() => expect(group).toHaveAttribute('aria-expanded', 'true'));
		}
		const labels = await canvas.findAllByText(i18n.ts.agree);
		for (const label of labels) {
			expect(buttons.at(-1)).toBeDisabled();
			await userEvent.click(label);
			// 同意の切り替えは os.confirm を挟む。確認ダイアログに答えないと値が立たない。
			// 開いた直後はフェードインで pointer-events: none なので、押せるまで待つ。
			const ok = await canvas.findByRole('button', { name: i18n.ts.ok });
			await waitFor(() => userEvent.click(ok));
			await waitFor(() => expect(ok).not.toBeInTheDocument());
		}
		expect(buttons.at(-1)).toBeEnabled();
	},
	args: {
		serverRules: [],
		tosUrl: null,
	},
	decorators: [
		(_, context) => ({
			setup() {
				const original = { serverRules: instance.serverRules, tosUrl: instance.tosUrl };
				updateInstance({
					serverRules: context.args['serverRules'] as string[],
					tosUrl: context.args['tosUrl'] as string | null,
				});
				onBeforeUnmount(() => {
					updateInstance(original);
				});
			},
			template: '<story/>',
		}),
	],
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkSignupServerRules>;
export const ServerRulesOnly = {
	...Empty,
	args: {
		...Empty.args,
		serverRules: ['ルール'],
	},
} satisfies StoryObj<typeof MkSignupServerRules>;
export const TOSOnly = {
	...Empty,
	args: {
		...Empty.args,
		tosUrl: 'https://example.com/tos',
	},
} satisfies StoryObj<typeof MkSignupServerRules>;
export const ServerRulesAndTOS = {
	...Empty,
	args: {
		...Empty.args,
		serverRules: ServerRulesOnly.args.serverRules,
		tosUrl: TOSOnly.args.tosUrl,
	},
} satisfies StoryObj<typeof MkSignupServerRules>;
