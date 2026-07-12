/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import MagicString from 'magic-string';
import { describe, expect, test } from 'vitest';
import { applyWithLocale } from '../builder/locale-inliner/apply-with-locale.js';
import { collectModifications } from '../builder/locale-inliner/collect-modifications.js';
import { blankLogger } from '../builder/logger.js';
import type { LocaleInliner } from '../builder/locale-inliner.js';
import type { Locale } from 'i18n';

const inliner = {
	scriptsDir: 'scripts',
	i18nFileName: 'i18n.js',
	i18nSymbol: 'n',
} as LocaleInliner;

const locale = {
	hello: 'こんにちは',
	searchEngine: {
		google: 'Google',
		duckduckgo: 'DuckDuckGo',
	},
} as unknown as Locale;

function inline(source: string): string {
	const output = new MagicString(source);
	const modifications = collectModifications(source, 'chunk.js', blankLogger, inliner);
	applyWithLocale(output, modifications, 'ja-JP', locale, blankLogger);
	return output.toString();
}

describe('locale inliner imports', () => {
	test('preserves other specifiers when i18n is the first specifier', () => {
		const source = 'import{n as i18n,t as chartText}from"./i18n.js";console.log(i18n.ts.hello,chartText("peak"));';
		expect(inline(source)).toBe('import{t as chartText}from"./i18n.js";console.log("こんにちは",chartText("peak"));');
	});

	test('preserves other specifiers when i18n is the last specifier', () => {
		const source = 'import{t as chartText,n as i18n}from"./i18n.js";console.log(chartText("peak"),i18n.ts.hello);';
		expect(inline(source)).toBe('import{t as chartText}from"./i18n.js";console.log(chartText("peak"),"こんにちは");');
	});

	test('ignores an import from the i18n chunk without the i18n export', () => {
		const source = 'import{t as chartText}from"./i18n.js";console.log(chartText("peak"));';
		expect(inline(source)).toBe(source);
	});
});

describe('locale inliner expressions', () => {
	test('parenthesizes localized objects used as arrow function expressions', () => {
		const source = 'import{n as i18n}from"./i18n.js";const getEngine=()=>i18n.ts.searchEngine[selected];';
		expect(inline(source)).toBe(
			'const getEngine=()=>({"google":"Google","duckduckgo":"DuckDuckGo"})[selected];',
		);
	});
});
