/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import type * as Misskey from 'misskey-js';
import { MediaProxy } from '@/shared/utility/media-proxy.js';

const SOURCE = 'https://origin.example/image.png';
const ENCODED_SOURCE = encodeURIComponent(SOURCE);

function createMediaProxy() {
	return new MediaProxy(
		{ mediaProxy: 'https://media.example.com' } as Misskey.entities.MetaDetailed,
		'https://example.com',
	);
}

describe('MediaProxy', () => {
	// 既にプロキシを通した URL を二重に包まず、元の URL を取り出して包み直す。
	test.each([
		['外部のメディアプロキシ', `https://media.example.com/image.webp?url=${ENCODED_SOURCE}&static=1`],
		['相対パスのローカルプロキシ', `/proxy/image.webp?url=${ENCODED_SOURCE}`],
		['絶対 URL のローカルプロキシ', `https://example.com/proxy/avatar.webp?url=${ENCODED_SOURCE}&avatar=1`],
	])('%s の URL から元の URL を取り出す', (_name, proxied) => {
		expect(createMediaProxy().getProxiedImageUrl(proxied)).toBe(
			`https://media.example.com/image.webp?url=${ENCODED_SOURCE}&fallback=1`,
		);
	});

	test.each([
		['他のサーバーの /proxy/', `https://other.example/proxy/image.webp?url=${ENCODED_SOURCE}`],
		[
			'メディアプロキシと前方一致するだけのホスト',
			`https://media.example.com.evil.example/image.webp?url=${ENCODED_SOURCE}`,
		],
	])('%s は元の URL として扱う', (_name, imageUrl) => {
		expect(createMediaProxy().getProxiedImageUrl(imageUrl)).toBe(
			`https://media.example.com/image.webp?url=${encodeURIComponent(imageUrl)}&fallback=1`,
		);
	});

	test('種類・ローカル強制・フォールバック無しを query に反映する', () => {
		expect(createMediaProxy().getProxiedImageUrl(SOURCE, 'preview', true, true)).toBe(
			`https://example.com/proxy/preview.webp?url=${ENCODED_SOURCE}&preview=1&origin=1`,
		);
	});
});
