/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, userEvent, within } from '@/stories/test.js';
import type { StoryObj } from '@/stories/types.js';
import MkCaptcha from './MkCaptcha.vue';

export const Default = {
	render: (args) => ({
		components: { MkCaptcha },
		setup: () => ({ args }),
		template: '<MkCaptcha v-bind="args" />',
	}),
	// 外部の CAPTCHA サービスを読み込まない testcaptcha で、入力の受け付けまでを通す。
	args: {
		provider: 'testcaptcha',
		sitekey: null,
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		await userEvent.type(canvas.getByRole('textbox', { name: 'captcha' }), 'ai-chan-kawaii');
		await userEvent.click(canvas.getByRole('button', { name: 'Submit' }));
		await expect(canvas.getByText('Test captcha passed!')).toBeInTheDocument();
	},
} satisfies StoryObj<typeof MkCaptcha>;
