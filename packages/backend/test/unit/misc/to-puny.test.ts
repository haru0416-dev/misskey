/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { toPuny, toPunyNullable } from '@/misc/to-puny.js';

describe('misc:to-puny', () => {
	test('大小を揃える', () => {
		expect(toPuny('EXAMPLE.COM')).toBe('example.com');
		expect(toPuny('ExAmPlE.CoM')).toBe('example.com');
	});

	test('IDN を Punycode にする', () => {
		expect(toPuny('日本語.jp')).toBe('xn--wgv71a119e.jp');
		expect(toPuny('münchen.de')).toBe('xn--mnchen-3ya.de');
	});

	test('既に Punycode のものは変えない', () => {
		expect(toPuny('xn--wgv71a119e.jp')).toBe('xn--wgv71a119e.jp');
	});

	test('UTS #46 の正規化が効く', () => {
		// 見えない文字を含む入力が、そのまま別ホストとして通ってしまわないこと。
		expect(toPuny('exa­mple.com')).toBe('example.com');
	});

	test('ポートを残してホスト名だけを変換する', () => {
		// ポート付きのホストどうしを同じ値にすると、自ホストの判定で別のホストを取り違える。
		expect(toPuny('Example.COM:8080')).toBe('example.com:8080');
		expect(toPuny('日本語.jp:8443')).toBe('xn--wgv71a119e.jp:8443');
		expect(toPuny('localhost:3104')).not.toBe(toPuny('127.0.0.1:31040'));
		expect(toPuny('[::1]:3000')).toBe('[::1]:3000');
		expect(toPuny('a b.com:80')).toBe('');
	});

	test('ポートは https の URL.host と同じ形にそろえる', () => {
		// DB のホストは URL.host から取るので、手入力の値も同じ形でないと一致しない。
		for (const host of ['example.com:443', 'example.com:08080', 'example.com:80', '[::1]:0443']) {
			expect(toPuny(host)).toBe(new URL(`https://${host}`).host);
		}
		expect(toPuny('example.com:65536')).toBe('');
	});

	test('ホスト名にできない入力は空文字列になる', () => {
		// domainToASCII の仕様。呼び出し側はホストが空になりうる前提で扱う必要がある。
		expect(toPuny('a b.com')).toBe('');
		expect(toPuny('')).toBe('');
	});

	test('toPunyNullable は null/undefined をそのまま null にする', () => {
		expect(toPunyNullable(null)).toBeNull();
		expect(toPunyNullable(undefined)).toBeNull();
		expect(toPunyNullable('EXAMPLE.COM')).toBe('example.com');
	});
});
