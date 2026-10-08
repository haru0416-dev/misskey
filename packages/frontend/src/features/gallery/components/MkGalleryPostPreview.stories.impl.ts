/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { expect, userEvent, waitFor, within } from '@/stories/test.js';
import type { StoryObj } from '@/stories/types.js';
import { galleryPost } from '@/stories/fakes.js';
import MkGalleryPostPreview from './MkGalleryPostPreview.vue';

/** サムネイルはリンクのタイトルと重複する装飾扱い (alt="") なので role からは引けない。読み込みと復号の完了まで待つ。 */
async function loadedThumbnail(canvasElement: HTMLElement): Promise<HTMLImageElement> {
	const image = await waitFor(() => {
		const found = canvasElement.querySelector<HTMLImageElement>('.thumbnail img');
		expect(found?.complete).toBe(true);
		expect(found?.naturalWidth).toBeGreaterThan(0);
		return found!;
	});
	await image.decode();
	return image;
}
export const Default = {
	render(args) {
		return {
			components: {
				MkGalleryPostPreview,
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
			template: '<MkGalleryPostPreview v-bind="props" />',
		};
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		const links = canvas.getAllByRole('link');
		expect(links).toHaveLength(2);
		expect(links[0]).toHaveAttribute('href', `/gallery/${galleryPost().id}`);
		expect(links[1]).toHaveAttribute('href', `/@${galleryPost().user.username}@${galleryPost().user.host}`);
		// 閲覧注意でない投稿は、読み込んだサムネイルをそのまま見せる。
		const image = await loadedThumbnail(canvasElement);
		await waitFor(() => expect(image).toBeVisible());
	},
	args: {
		post: galleryPost(),
	},
	decorators: [
		() => ({
			template: '<div style="width:260px"><story /></div>',
		}),
	],
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkGalleryPostPreview>;
export const Sensitive = {
	...Default,
	args: {
		...Default.args,
		post: galleryPost(true),
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		const [postLink] = canvas.getAllByRole('link');
		// 閲覧注意の投稿は、サムネイルを読み込んでもぼかし (blurhash の canvas) のまま見せる。
		const image = await loadedThumbnail(canvasElement);
		const blurhash = canvasElement.querySelector('.thumbnail canvas');
		expect(image).not.toBeVisible();
		expect(blurhash).toBeVisible();
		// 指を乗せている間だけ本来の画像を見せる。
		await userEvent.hover(postLink!);
		await waitFor(() => expect(image).toBeVisible());
		await userEvent.unhover(postLink!);
		await waitFor(() => expect(image).not.toBeVisible());
	},
} satisfies StoryObj<typeof MkGalleryPostPreview>;
