/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { assert, beforeEach, describe, test } from 'vitest';
import {
	normalizeString,
	initIntlString,
	normalizeStringWithHiragana,
	compareStringEquals,
	compareStringIncludes,
} from '@/utility/intl-string.js';

const runCommonTests = (normalizeFn: (str: string) => string) => {
	// 全角の半角化と濁点の結合は、どちらも NFKC 正規化による。
	test('全角英数字が半角の小文字になり、濁点が結合される', () => {
		assert.strictEqual(normalizeFn('Ｂ１２３'), 'b123');
		assert.strictEqual(normalizeFn('か\u3099'), 'が');
	});
	test('小文字に揃う', () => {
		const input = 'tSt';
		const expected = 'tst';
		assert.strictEqual(normalizeFn(input), expected);
	});
	test('文字列の前後の空白が削除される', () => {
		const input = '   tst   ';
		const expected = 'tst';
		assert.strictEqual(normalizeFn(input), expected);
	});
};

describe('normalize string', () => {
	runCommonTests(normalizeString);

	test('合字と半角カタカナを NFKC で正規化する', () => {
		assert.strictEqual(normalizeString('ﬁ'), 'fi');
		assert.strictEqual(normalizeString('ｶﾀｶﾅ'), 'カタカナ');
	});
});

describe('normalize string with hiragana', () => {
	beforeEach(async () => {
		await initIntlString(true);
	});

	describe('共通のnormalizeStringテスト', () => {
		runCommonTests(normalizeStringWithHiragana);
	});

	test('半角カタカナがひらがなに変換される', () => {
		const input = 'ｶﾀｶﾅ';
		const expected = 'かたかな';
		assert.strictEqual(normalizeStringWithHiragana(input), expected);
	});

	test('カタカナがひらがなに変換される・伸ばし棒はハイフンに変換される', () => {
		const input = 'カタカナひーらがーな';
		const expected = 'かたかなひ-らが-な';
		assert.strictEqual(normalizeStringWithHiragana(input), expected);
	});

	test('ローマ字がひらがなに変換される', () => {
		const input = 'ro-majimohiragananinarimasu';
		const expected = 'ろ-まじもひらがなになります';
		assert.strictEqual(normalizeStringWithHiragana(input), expected);
	});
});

describe('compareStringEquals', () => {
	beforeEach(async () => {
		await initIntlString(true);
	});

	test('完全一致ならtrue', () => {
		assert.isTrue(compareStringEquals('テスト', 'テスト'));
	});

	test('大文字・小文字の違いを無視', () => {
		assert.isTrue(compareStringEquals('TeSt', 'test'));
	});

	test('カタカナとひらがなの違いを無視', () => {
		assert.isTrue(compareStringEquals('カタカナ', 'かたかな'));
	});

	test('異なる文字列はfalse', () => {
		assert.isFalse(compareStringEquals('テスト', 'サンプル'));
	});
});

describe('compareStringIncludes', () => {
	// ひらがなへの変換は initIntlString で読み込むまで恒等変換なので、他の describe の実行順に頼らず読み込む。
	beforeEach(async () => {
		await initIntlString(true);
	});

	test('部分一致ならtrue', () => {
		assert.isTrue(compareStringIncludes('これはテストです', 'テスト'));
	});

	test('大文字・小文字の違いを無視', () => {
		assert.isTrue(compareStringIncludes('This is a Test', 'test'));
	});

	test('カタカナとひらがなの違いを無視', () => {
		assert.isTrue(compareStringIncludes('カタカナのテスト', 'かたかな'));
	});

	test('異なる文字列はfalse', () => {
		assert.isFalse(compareStringIncludes('これはテストです', 'サンプル'));
	});
});
