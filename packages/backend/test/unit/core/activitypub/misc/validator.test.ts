/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import {
	validateContentTypeSetAsActivityPub,
	validateContentTypeSetAsJsonLD,
} from '@/core/activitypub/misc/validator.js';

// 取得した応答を AP オブジェクトとして読む前の Content-Type の検査。利用者がアップロードしたファイル (画像など) を
// AP オブジェクトとして読ませないための歯止めなので、通す形と弾く形をそれぞれの分岐で見る。
const response = (contentType: string | null) => ({
	headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
});

describe('validateContentTypeSetAsActivityPub', () => {
	test.each([
		'application/activity+json',
		'Application/Activity+JSON; charset=utf-8',
		'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
	])('%s を通す', (contentType) => {
		expect(() => validateContentTypeSetAsActivityPub(response(contentType))).not.toThrow();
	});

	test.each([
		// ActivityStreams の profile が無い JSON-LD は AP オブジェクトとして扱わない。
		'application/ld+json',
		'application/ld+json; profile="https://example.com/other"',
		'application/json',
		'image/webp',
	])('%s を弾く', (contentType) => {
		expect(() => validateContentTypeSetAsActivityPub(response(contentType))).toThrow('Content type is not');
	});

	test('Content-Type が無ければ弾く', () => {
		expect(() => validateContentTypeSetAsActivityPub(response(null))).toThrow('No content-type header');
	});
});

describe('validateContentTypeSetAsJsonLD', () => {
	test.each([
		'application/ld+json',
		'application/json; charset=utf-8',
		'application/activity+json',
		'text/x-custom+json;charset=utf-8',
	])('%s を通す', (contentType) => {
		expect(() => validateContentTypeSetAsJsonLD(response(contentType))).not.toThrow();
	});

	test.each(['image/webp', 'application/x+jsonish'])('%s を弾く', (contentType) => {
		expect(() => validateContentTypeSetAsJsonLD(response(contentType))).toThrow('Content type is not');
	});

	test('Content-Type が無ければ弾く', () => {
		expect(() => validateContentTypeSetAsJsonLD(response(null))).toThrow('No content-type header');
	});
});
