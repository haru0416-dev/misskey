/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, assert, afterEach, expect } from 'vitest';
import { render, cleanup } from '@testing-library/vue';
import type { RenderResult } from '@testing-library/vue';
import './init';
import type * as Misskey from 'misskey-js';
import { components } from '@/components/index.js';
import { directives } from '@/directives/index.js';
import MkMediaImage from '@/features/media-viewer/components/MkMediaImage.vue';
import { requireReactionCount } from '@/features/note/components/MkReactionsViewer.vue';

describe('MkMediaImage', () => {
	const createImage = (image: Partial<Misskey.entities.DriveFile>): Misskey.entities.DriveFile =>
		({
			id: 'xxxxxxxx',
			createdAt: new Date().toJSON(),
			isSensitive: false,
			name: 'example.png',
			thumbnailUrl: null,
			url: '',
			type: 'application/octet-stream',
			size: 1,
			md5: '15eca7fba0480996e2245f5185bf39f2',
			blurhash: null,
			comment: null,
			properties: {},
			...image,
		}) as Misskey.entities.DriveFile;

	const renderMediaImage = (image: Partial<Misskey.entities.DriveFile>): RenderResult => {
		return render(MkMediaImage, {
			props: { image: createImage(image) },
			global: { directives, components },
		});
	};

	afterEach(() => {
		cleanup();
	});

	test('Attaching JPG should show no indicator', async () => {
		const mkMediaImage = renderMediaImage({
			type: 'image/jpeg',
		});
		const [gif, alt] = await Promise.all([mkMediaImage.queryByText('GIF'), mkMediaImage.queryByText('ALT')]);
		assert.ok(!gif);
		assert.ok(!alt);
	});

	test('Attaching APNG should show a GIF indicator', async () => {
		const mkMediaImage = renderMediaImage({
			type: 'image/apng',
		});
		const [gif, alt] = await Promise.all([mkMediaImage.queryByText('GIF'), mkMediaImage.queryByText('ALT')]);
		assert.ok(gif);
		assert.ok(!alt);
	});

	test('GIF and ALT indicators follow their independent image properties', async () => {
		const image = createImage({ type: 'image/gif' });
		const mkMediaImage = renderMediaImage(image);
		assert.ok(mkMediaImage.queryByText('GIF'));
		assert.ok(!mkMediaImage.queryByText('ALT'));

		await mkMediaImage.rerender({
			image: { ...image, type: 'image/png', comment: 'Misskeyのロゴです' },
		});
		assert.ok(!mkMediaImage.queryByText('GIF'));
		assert.ok(mkMediaImage.queryByText('ALT'));

		await mkMediaImage.rerender({
			image: { ...image, type: 'image/gif', comment: 'Misskeyのロゴです' },
		});
		assert.ok(mkMediaImage.queryByText('GIF'));
		assert.ok(mkMediaImage.queryByText('ALT'));
	});

	test('Icon-only media controls have accessible names', () => {
		const mkMediaImage = renderMediaImage({ type: 'image/png' });
		assert.ok(mkMediaImage.getByRole('button', { name: 'Menu' }));
		assert.ok(mkMediaImage.getByRole('button', { name: 'Hide' }));
	});
});

describe('MkReactionsViewer', () => {
	test('rejects a current-user reaction without a corresponding count', () => {
		expect(() => requireReactionCount({ ':other:': 1 }, ':mine:')).toThrow(
			"Reaction count is missing for the current user's reaction: :mine:",
		);
	});
});
