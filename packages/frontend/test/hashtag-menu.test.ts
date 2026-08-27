/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { isSameMute, toHashtagMute } from '@/features/notes/get-hashtag-menu.js';
import { checkWordMute } from '@/features/notes/check-word-mute.js';
import type * as Misskey from 'misskey-js';

const noteWith = (text: string) => ({ id: 'n', userId: 'other', text, cw: null }) as Misskey.entities.Note;
const me = { id: 'me' } as Misskey.entities.UserLite;

describe('ハッシュタグのミュート行', () => {
	test('大小の違いを無視して一致する', () => {
		const mute = toHashtagMute('Misskey');
		expect(checkWordMute(noteWith('hello #misskey'), me, [mute])).not.toBe(false);
		expect(checkWordMute(noteWith('hello #MISSKEY'), me, [mute])).not.toBe(false);
	});

	test('前方一致で別のタグを巻き込まない', () => {
		// `#cat` のミュートが `#cats` まで消すと、意図しない投稿が見えなくなる。
		const mute = toHashtagMute('cat');
		expect(checkWordMute(noteWith('a #cat b'), me, [mute])).not.toBe(false);
		expect(checkWordMute(noteWith('a #cats b'), me, [mute])).toBe(false);
		expect(checkWordMute(noteWith('a #cat_lover b'), me, [mute])).toBe(false);
	});

	test('タグを含まないノートには当たらない', () => {
		expect(checkWordMute(noteWith('cat without hash'), me, [toHashtagMute('cat')])).toBe(false);
	});

	test('正規表現の特殊文字を含むタグでも壊れない', () => {
		const mute = toHashtagMute('C++');
		expect(() => new RegExp(mute.slice(1, mute.lastIndexOf('/')), 'iu')).not.toThrow();
		expect(checkWordMute(noteWith('a #C++ b'), me, [mute])).not.toBe(false);
		expect(checkWordMute(noteWith('a #C b'), me, [mute])).toBe(false);
	});
});

describe('ハッシュタグのミュート行の同定', () => {
	test('自分が作った行と一致する', () => {
		expect(isSameMute(toHashtagMute('misskey'), 'misskey')).toBe(true);
	});

	test('別のタグの行とは一致しない', () => {
		expect(isSameMute(toHashtagMute('misskey'), 'erebia')).toBe(false);
	});

	test('旧形式 (1語だけの配列) も外せる', () => {
		// 以前の版が入れた行を残したままにすると、解除できなくなる。
		expect(isSameMute(['#misskey'], 'misskey')).toBe(true);
	});

	// 複数語の行は AND 条件で、単独のハッシュタグとは意味が違う。
	// 一致させると「#a と #b の両方を含む」設定をハッシュタグ1つで消してしまう。
	test('AND条件の行とは一致しない', () => {
		expect(isSameMute(['#misskey', '#erebia'], 'misskey')).toBe(false);
	});

	test('無関係な正規表現の行とは一致しない', () => {
		expect(isSameMute('/foo/i', 'misskey')).toBe(false);
	});
});
