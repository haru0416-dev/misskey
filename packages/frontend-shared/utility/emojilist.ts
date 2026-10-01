/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const unicodeEmojiCategories = [
	'face',
	'people',
	'animals_and_nature',
	'food_and_drink',
	'activity',
	'travel_and_places',
	'objects',
	'symbols',
	'flags',
] as const;

export type UnicodeEmojiDef = {
	name: string;
	char: string;
	category: (typeof unicodeEmojiCategories)[number];
};

import _emojilist from '@misskey-dev/emoji-data/emojilist.json';

export const emojilist: UnicodeEmojiDef[] = _emojilist.map((x) => {
	const category = unicodeEmojiCategories[x[2] as number];
	if (category == null) {
		throw new Error(`Unknown emoji category: ${x[2]}`);
	}
	return {
		name: x[1] as string,
		char: x[0] as string,
		category,
	};
});

const unicodeEmojisMap = new Map<string, UnicodeEmojiDef>(emojilist.map((x) => [x.char, x]));

const _indexByChar = new Map<string, number>();
const _charGroupByCategory = new Map<string, string[]>();
for (const [i, emo] of emojilist.entries()) {
	_indexByChar.set(emo.char, i);

	if (_charGroupByCategory.has(emo.category)) {
		_charGroupByCategory.get(emo.category)?.push(emo.char);
	} else {
		_charGroupByCategory.set(emo.category, [emo.char]);
	}
}

export const emojiCharByCategory = _charGroupByCategory;

export function getUnicodeEmojiOrNull(char: string): UnicodeEmojiDef | null {
	// emojilist.jsonがカラースタイルを前提としているため変換する
	return (
		unicodeEmojisMap.get(forceColorizeEmoji(char)) ??
		// カラースタイル絵文字がjsonに無い場合はテキストスタイル絵文字にフォールバックする
		unicodeEmojisMap.get(char) ??
		null
	);
}

export function getUnicodeEmoji(char: string): UnicodeEmojiDef | string {
	return getUnicodeEmojiOrNull(char) ?? char;
}

export function isSupportedEmoji(char: string): boolean {
	return unicodeEmojisMap.has(forceColorizeEmoji(char)) || unicodeEmojisMap.has(char);
}

export function getEmojiName(char: string): string {
	const idx = _indexByChar.get(forceColorizeEmoji(char)) ?? _indexByChar.get(char);
	if (idx === undefined) {
		return char;
	}
	return emojilist[idx]?.name ?? char;
}

/**
 * テキストスタイル絵文字（U+260Eなどの1文字で表現される絵文字）をカラースタイル絵文字に変換する（VS16:U+FE0Fを付与）。
 */
export function colorizeEmoji(char: string) {
	// サロゲートペアを 2 文字と数えないよう、UTF-16 コードユニット数ではなくコードポイント数で判定する。
	return Array.from(char).length === 1 ? `${char}\uFE0F` : char;
}

/**
 * 文字種にかかわらず、カラースタイル絵文字への変換を試みる（本ファイルにある検索プログラム用・フォールバックが必須）。
 */
function forceColorizeEmoji(char: string) {
	// サロゲートペアの途中へ VS16 を挿入しないよう、コードポイント単位で分割する。
	const chars = Array.from(char);
	if (chars.includes('\uFE0F')) {
		return char;
	}
	chars.splice(1, 0, '\uFE0F');
	return chars.join('');
}

export interface CustomEmojiFolderTree {
	value: string;
	category: string;
	children: CustomEmojiFolderTree[];
}
