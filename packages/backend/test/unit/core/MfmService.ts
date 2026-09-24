/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as mfm from 'mfm-js';
import { beforeAll, describe, expect, test } from 'vitest';

import { loadConfig } from '@/config.js';
import { createMfmService } from '@/core/mfm/MfmService.js';
import type { MfmService } from '@/core/mfm/MfmService.js';

describe('MfmService', () => {
	let mfmService: MfmService;

	beforeAll(() => {
		mfmService = createMfmService(loadConfig());
	});

	describe('toHtml', () => {
		test('br', () => {
			const input = 'foo\nbar\nbaz';
			const output = 'foo<br />bar<br />baz';
			expect(mfmService.toHtml(mfm.parse(input))).toBe(output);
		});

		test('br alt', () => {
			const input = 'foo\r\nbar\rbaz';
			const output = 'foo<br />bar<br />baz';
			expect(mfmService.toHtml(mfm.parse(input))).toBe(output);
		});

		test('Do not generate unnecessary span', () => {
			const input = 'foo $[tada bar]';
			const output = 'foo <i>bar</i>';
			expect(mfmService.toHtml(mfm.parse(input))).toBe(output);
		});

		test('escape', () => {
			const input = '```\n<p>Hello, world!</p>\n```';
			const output = '<pre><code>&lt;p&gt;Hello, world!&lt;/p&gt;</code></pre>';
			expect(mfmService.toHtml(mfm.parse(input))).toBe(output);
		});
	});

	describe('fromHtml', () => {
		test('p', () => {
			expect(mfmService.fromHtml('<p>a</p><p>b</p>')).toBe('a\n\nb');
		});

		test('block element', () => {
			expect(mfmService.fromHtml('<div>a</div><div>b</div>')).toBe('a\nb');
		});

		test('inline element', () => {
			expect(mfmService.fromHtml('<ul><li>a</li><li>b</li></ul>')).toBe('a\nb');
		});

		test('block code', () => {
			expect(mfmService.fromHtml('<pre><code>a\nb</code></pre>')).toBe('```\na\nb\n```');
		});

		test('inline code', () => {
			expect(mfmService.fromHtml('<code>a</code>')).toBe('`a`');
		});

		test('quote', () => {
			expect(mfmService.fromHtml('<blockquote>a\nb</blockquote>')).toBe('> a\n> b');
		});

		test('br', () => {
			expect(mfmService.fromHtml('<p>abc<br><br/>d</p>')).toBe('abc\n\nd');
		});

		test('link with different text', () => {
			expect(mfmService.fromHtml('<p>a <a href="https://example.com/b">c</a> d</p>')).toBe(
				'a [c](https://example.com/b) d',
			);
		});

		test('link with different text, but not encoded', () => {
			expect(mfmService.fromHtml('<p>a <a href="https://example.com/ä">c</a> d</p>')).toBe(
				'a [c](<https://example.com/ä>) d',
			);
		});

		test('link with same text', () => {
			expect(mfmService.fromHtml('<p>a <a href="https://example.com/b">https://example.com/b</a> d</p>')).toBe(
				'a https://example.com/b d',
			);
		});

		test('link with same text, but not encoded', () => {
			expect(mfmService.fromHtml('<p>a <a href="https://example.com/ä">https://example.com/ä</a> d</p>')).toBe(
				'a <https://example.com/ä> d',
			);
		});

		test('link with no url', () => {
			expect(mfmService.fromHtml('<p>a <a href="b">c</a> d</p>')).toBe('a [c](b) d');
		});

		test('link without href', () => {
			expect(mfmService.fromHtml('<p>a <a>c</a> d</p>')).toBe('a c d');
		});

		test('link without text', () => {
			expect(mfmService.fromHtml('<p>a <a href="https://example.com/b"></a> d</p>')).toBe('a https://example.com/b d');
		});

		test('link without both', () => {
			expect(mfmService.fromHtml('<p>a <a></a> d</p>')).toBe('a  d');
		});

		test('ruby', () => {
			expect(mfmService.fromHtml('<p>a <ruby>Misskey<rp>(</rp><rt>ミスキー</rt><rp>)</rp></ruby> b</p>')).toBe(
				'a $[ruby Misskey ミスキー] b',
			);
			expect(
				mfmService.fromHtml(
					'<p>a <ruby>Misskey<rp>(</rp><rt>ミスキー</rt><rp>)</rp>Misskey<rp>(</rp><rt>ミスキー</rt><rp>)</rp></ruby> b</p>',
				),
			).toBe('a $[ruby Misskey ミスキー]$[ruby Misskey ミスキー] b');
		});

		test('ruby with spaces', () => {
			expect(mfmService.fromHtml('<p>a <ruby>Miss key<rp>(</rp><rt>ミスキー</rt><rp>)</rp> b</ruby> c</p>')).toBe(
				'a Miss key(ミスキー) b c',
			);
			expect(mfmService.fromHtml('<p>a <ruby>Misskey<rp>(</rp><rt>ミス キー</rt><rp>)</rp> b</ruby> c</p>')).toBe(
				'a Misskey(ミス キー) b c',
			);
			expect(
				mfmService.fromHtml(
					'<p>a <ruby>Misskey<rp>(</rp><rt>ミスキー</rt><rp>)</rp>Misskey<rp>(</rp><rt>ミス キー</rt><rp>)</rp>Misskey<rp>(</rp><rt>ミスキー</rt><rp>)</rp></ruby> b</p>',
				),
			).toBe('a Misskey(ミスキー)Misskey(ミス キー)Misskey(ミスキー) b');
		});

		test('ruby with other inline tags', () => {
			expect(
				mfmService.fromHtml('<p>a <ruby><strong>Misskey</strong><rp>(</rp><rt>ミスキー</rt><rp>)</rp> b</ruby> c</p>'),
			).toBe('a **Misskey**(ミスキー) b c');
		});

		test('mention', () => {
			expect(
				mfmService.fromHtml('<p>a <a href="https://example.com/@user" class="u-url mention">@user</a> d</p>'),
			).toBe('a @user@example.com d');
		});

		test('hashtag', () => {
			expect(mfmService.fromHtml('<p>a <a href="https://example.com/tags/a">#a</a> d</p>', ['#a'])).toBe('a #a d');
		});
	});
});
