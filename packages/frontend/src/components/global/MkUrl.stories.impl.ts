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
import { miLocalStorage } from '@/local-storage.js';
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
		// このコンポーネントの仕事は URL を分解して読める形に整えること。href だけ見ても
		// 表示側の回帰は捕まらない。
		await expect(a).toHaveTextContent('https://');
		await expect(a).toHaveTextContent('misskey-hub.net');
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
// Punycode の復元は ASCII ドメインでは何も起きないので、IDN を通す story を別に置く。
// 復元してよいかは閲覧者の表示言語で決まるため、環境の言語設定に左右されないよう story 側で固定する。
function renderWithLang(lang: string): (typeof Default)['render'] {
	return (args) => {
		miLocalStorage.setItem('lang', lang);
		return Default.render(args);
	};
}

export const Idn = {
	...Default,
	render: renderWithLang('ja-JP'),
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		const a = canvas.getByRole<HTMLAnchorElement>('link');
		await expect(a).toHaveTextContent('日本語.jp');
	},
	args: {
		...Default.args,
		url: 'https://xn--wgv71a119e.jp/',
	},
} satisfies StoryObj<typeof MkUrl>;

// 復元すると全てキリル文字の `аррӏе.com` になり apple.com と見分けが付かない。
// ブラウザのアドレスバーが xn-- のまま出すのと同じ理由で、日本語表示の閲覧者には復元しない。
export const IdnConfusable = {
	...Default,
	render: renderWithLang('ja-JP'),
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		const a = canvas.getByRole<HTMLAnchorElement>('link');
		await expect(a).toHaveTextContent('xn--80ak6aa92e.com');
	},
	args: {
		...Default.args,
		url: 'https://xn--80ak6aa92e.com/',
	},
} satisfies StoryObj<typeof MkUrl>;
