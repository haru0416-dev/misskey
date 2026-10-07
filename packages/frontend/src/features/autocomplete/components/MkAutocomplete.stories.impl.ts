/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { action } from '@/stories/action.js';
import { expect, userEvent, waitFor, within } from '@/stories/test.js';
import { HttpResponse, http } from 'msw';
import { userDetailed } from '@/stories/fakes.js';
import { commonHandlers } from '@/stories/mocks.js';
import MkAutocomplete from './MkAutocomplete.vue';
import MkInput from '@/components/form/MkInput.vue';
import type { StoryObj } from '@/stories/types.js';
const common = {
	render(args) {
		return {
			components: {
				MkAutocomplete,
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
						open: action('open'),
						closed: action('closed'),
					};
				},
			},
			template: '<MkAutocomplete v-bind="props" v-on="events" :textarea="textarea" />',
		};
	},
	args: {
		close: action('close'),
		x: 0,
		y: 0,
	},
	decorators: [
		(_, context) => ({
			components: {
				MkInput,
			},
			data() {
				return {
					q: context.args.q,
					textarea: null,
				};
			},
			methods: {
				inputMounted() {
					this.textarea = this.$refs.input.$refs.inputEl;
				},
			},
			template:
				'<MkInput v-model="q" ref="input" @vue:mounted="inputMounted"/><story v-if="textarea" :q="q" :textarea="textarea"/>',
		}),
	],
	parameters: {
		controls: {
			exclude: ['textarea'],
		},
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkAutocomplete>;
export const User = {
	...common,
	args: {
		...common.args,
		type: 'user',
	},
	async play({ canvasElement }: { canvasElement: HTMLElement }) {
		const canvas = within(canvasElement);
		// MkInput は汎用の text input なので role は combobox ではなく textbox。
		const input = canvas.getByRole('textbox');
		await userEvent.hover(input);
		await userEvent.click(input);
		await userEvent.type(input, 'm');
		await waitFor(() => expect(canvas.getByRole('list')).toHaveTextContent('mizuki'), { timeout: 16384 });
	},
	parameters: {
		...common.parameters,
		msw: {
			handlers: [
				...commonHandlers,
				http.post('/api/users/search-by-username-and-host', () => {
					return HttpResponse.json([
						userDetailed('44', 'mizuki', 'misskey-hub.net', 'Mizuki'),
						userDetailed('49', 'momoko', 'misskey-hub.net', 'Momoko'),
					]);
				}),
			],
		},
	},
};
export const Hashtag = {
	...common,
	args: {
		...common.args,
		type: 'hashtag',
	},
	async play({ canvasElement }: { canvasElement: HTMLElement }) {
		const canvas = within(canvasElement);
		const input = canvas.getByRole('textbox');
		await userEvent.hover(input);
		await userEvent.click(input);
		await userEvent.type(input, '気象');
		await waitFor(() => expect(canvas.getByRole('list')).toHaveTextContent('気象警報注意報'), { timeout: 16384 });
	},
	parameters: {
		...common.parameters,
		msw: {
			handlers: [
				...commonHandlers,
				http.post('/api/hashtags/search', () => {
					return HttpResponse.json(['気象警報注意報', '気象警報', '気象情報']);
				}),
			],
		},
	},
};
export const Emoji = {
	...common,
	args: {
		...common.args,
		type: 'emoji',
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		const input = canvas.getByRole('textbox');
		await userEvent.hover(input);
		await userEvent.click(input);
		await userEvent.type(input, 'smile');
		await waitFor(() => expect(canvas.getByRole('list')).toHaveTextContent('smile'), { timeout: 16384 });
	},
} satisfies StoryObj<typeof MkAutocomplete>;
export const MfmTag = {
	...common,
	args: {
		...common.args,
		type: 'mfmTag',
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		const input = canvas.getByRole('textbox');
		await userEvent.hover(input);
		await userEvent.click(input);
		await waitFor(() => expect(within(canvas.getByRole('list')).getByText('spin', { exact: true })).toBeVisible(), {
			timeout: 16384,
		});
	},
} satisfies StoryObj<typeof MkAutocomplete>;
