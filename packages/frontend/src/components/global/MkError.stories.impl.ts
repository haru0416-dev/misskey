/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { action, onAction } from '@/stories/action.js';
import { expect, userEvent, waitFor, within } from '@/stories/test.js';
import type { StoryObj } from '@/stories/types.js';
import MkError from './MkError.vue';
import { i18n } from '@/i18n.js';
export const Default = {
	render(args) {
		return {
			components: {
				MkError,
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
						retry: action('retry'),
					};
				},
			},
			template: '<MkError v-bind="props" v-on="events" />',
		};
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		const fired: string[] = [];
		const stop = onAction((record) => fired.push(record.name));
		try {
			await userEvent.click(canvas.getByRole('button', { name: i18n.ts.retry }));
			await waitFor(() => expect(fired).toContain('retry'));
		} finally {
			stop();
		}
	},
	args: {},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkError>;
