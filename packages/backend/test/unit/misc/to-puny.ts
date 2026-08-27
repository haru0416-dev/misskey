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
