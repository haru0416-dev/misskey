/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { isSameMute } from '@/features/notes/get-hashtag-menu.js';

describe('ハッシュタグのミュート判定', () => {
	test('1語だけの行と一致する', () => {
		expect(isSameMute(['#misskey'], '#misskey')).toBe(true);
	});

	test('別の語とは一致しない', () => {
		expect(isSameMute(['#misskey'], '#erebia')).toBe(false);
	});

	// 複数語の行は AND 条件で、単独のハッシュタグとは意味が違う。
	// 一致させると「#a と #b の両方を含む」設定をハッシュタグ1つで消してしまう。
	test('AND条件の行とは一致しない', () => {
		expect(isSameMute(['#misskey', '#erebia'], '#misskey')).toBe(false);
	});

	// 正規表現の行は文字列で持つ。取り違えると利用者の正規表現を壊す。
	test('正規表現の行とは一致しない', () => {
		expect(isSameMute('/#misskey/', '#misskey')).toBe(false);
	});
});
