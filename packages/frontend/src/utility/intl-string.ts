/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { versatileLang } from '@shared/utility/intl-const.js';
import type { toHiragana as toHiraganaType } from 'wanakana';

let toHiragana: typeof toHiraganaType = (str?: string) => str ?? '';
let isWanakanaLoaded = false;
let wanakanaPromise: Promise<void> | null = null;
let graphemeSegmenter: Intl.Segmenter | null = null;

/**
 * ローマ字変換のセットアップ（日本語以外の環境で読み込まないのでlazy-loading）
 *
 * ここの比較系関数を使う際は事前に呼び出す必要がある
 */
export async function initIntlString(forceWanakana = false) {
	if ((!versatileLang.includes('ja') && !forceWanakana) || isWanakanaLoaded) {
		return;
	}
	wanakanaPromise ??= import('wanakana')
		.then(({ toHiragana: _toHiragana }) => {
			toHiragana = _toHiragana;
			isWanakanaLoaded = true;
		})
		.catch((error: unknown) => {
			wanakanaPromise = null;
			throw error;
		});
	await wanakanaPromise;
}

/**
 * - 全角英数字を半角に
 * - 半角カタカナを全角に
 * - 濁点・半濁点がリガチャになっている（例: `か` ＋ `゛` ）ひらがな・カタカナを結合
 * - 異体字を正規化
 * - 小文字に揃える
 * - 文字列のトリム
 */
export function normalizeString(str: string) {
	graphemeSegmenter ??= new Intl.Segmenter(versatileLang, { granularity: 'grapheme' });
	return [...graphemeSegmenter.segment(str)]
		.map(({ segment }) => segment.normalize('NFKC'))
		.join('')
		.toLowerCase()
		.trim();
}

// https://qiita.com/non-caffeine/items/77360dda05c8ce510084
const hyphens = [
	0x00_2d, // hyphen-minus
	0x02_d7, // modifier letter minus sign
	0x11_73, // hangul jongseong eu
	0x16_80, // ogham space mark
	0x1b_78, // balinese musical symbol left-hand open pang
	0x20_10, // hyphen
	0x20_11, // non-breaking hyphen
	0x20_12, // figure dash
	0x20_13, // en dash
	0x20_14, // em dash
	0x20_15, // horizontal bar
	0x20_43, // hyphen bullet
	0x20_7b, // superscript minus
	0x22_12, // minus sign
	0x25_ac, // black rectangle
	0x25_00, // box drawings light horizontal
	0x25_01, // box drawings heavy horizontal
	0x27_96, // heavy minus sign
	0x30_fc, // katakana-hiragana prolonged sound mark
	0x31_61, // hangul letter eu
	0xfe_58, // small em dash
	0xfe_63, // small hyphen-minus
	0xff_0d, // fullwidth hyphen-minus
	0xff_70, // halfwidth katakana-hiragana prolonged sound mark
	0x1_01_10, // aegean number ten
	0x1_01_91, // roman uncia sign
];

const hyphensCodePoints = hyphens.map((code) => `\\u{${code.toString(16).padStart(4, '0')}}`);
const hyphensRegex = new RegExp(`[${hyphensCodePoints.join('')}]`, 'ug');

/** ハイフンを統一（ローマ字半角入力時に`ー`と`-`が判定できない問題の調整） */
function normalizeHyphens(str: string) {
	return str.replace(hyphensRegex, '\u002D');
}

/**
 * `normalizeString` に加えて、カタカナ・ローマ字をひらがなに揃え、ハイフンを統一
 *
 * （ローマ字じゃないものもローマ字として認識され変換されるので、文字列比較の際は `normalizeString` を併用する必要あり）
 */
export function normalizeStringWithHiragana(str: string) {
	return normalizeStringWithHiraganaFromNormalized(normalizeString(str));
}

function normalizeStringWithHiraganaFromNormalized(str: string): string {
	return normalizeHyphens(toHiragana(str, { convertLongVowelMark: false }));
}

/** aとbが同じかどうか */
export function compareStringEquals(a: string, b: string) {
	if (a === b) {
		return true;
	} // まったく同じ場合はtrue。なお、ノーマライズ前後で文字数が変化することがあるため、文字数が違うからといってfalseにはできない
	const normalizedA = normalizeString(a);
	const normalizedB = normalizeString(b);
	if (normalizedA === normalizedB) {
		return true;
	}
	if (
		normalizeStringWithHiraganaFromNormalized(normalizedA) === normalizeStringWithHiraganaFromNormalized(normalizedB)
	) {
		return true;
	}
	return false;
}

/** baseにqueryが含まれているかどうか */
export function compareStringIncludes(base: string, query: string) {
	if (base === query) {
		return true;
	} // まったく同じ場合は含まれていると考えてよいのでtrue
	if (base.includes(query)) {
		return true;
	}
	const normalizedBase = normalizeString(base);
	const normalizedQuery = normalizeString(query);
	if (normalizedBase.includes(normalizedQuery)) {
		return true;
	}
	if (
		normalizeStringWithHiraganaFromNormalized(normalizedBase).includes(
			normalizeStringWithHiraganaFromNormalized(normalizedQuery),
		)
	) {
		return true;
	}
	return false;
}
