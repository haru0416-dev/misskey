/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { compile, parseThemeJsonOrNull, validateTheme } from '@shared/utility/theme.js';
import { parseThemeCode, parseThemeOrNull } from '@shared/utility/theme-code.js';
import type { Theme } from '@shared/utility/theme.js';

const validTheme = {
	id: 'test-theme',
	name: 'Test theme',
	author: 'tester',
	base: 'light',
	props: {
		accent: '#abcdef',
	},
} satisfies Theme;

describe('theme validation', () => {
	test('accepts a structurally valid theme', () => {
		expect(validateTheme(validTheme)).toBe(true);
		expect(parseThemeCode(JSON.stringify(validTheme))).toStrictEqual(validTheme);
		expect(compile(validTheme)['accent']).toBe('rgb(171, 205, 239)');
	});

	test('parses valid JSON5 and returns null for malformed or invalid themes', () => {
		expect(
			parseThemeOrNull(`{
			id: 'json5-theme',
			name: 'JSON5 theme',
			author: 'tester',
			base: 'dark',
			props: { accent: '#123456' },
		}`)?.id,
		).toBe('json5-theme');
		expect(parseThemeOrNull('{')).toBeNull();
		expect(parseThemeOrNull(JSON.stringify({ ...validTheme, props: null }))).toBeNull();
		expect(parseThemeOrNull(null)).toBeNull();
		expect(parseThemeOrNull(undefined)).toBeNull();
	});

	test.each([
		null,
		[],
		{ ...validTheme, author: undefined },
		{ ...validTheme, desc: 1 },
		{ ...validTheme, props: null },
		{ ...validTheme, props: [] },
		{ ...validTheme, props: { accent: 1 } },
		{ ...validTheme, codeHighlighter: [] },
		{ ...validTheme, codeHighlighter: { base: '_none_' } },
		{ ...validTheme, codeHighlighter: { base: '_none_', overrides: [] } },
	])('rejects an invalid theme: %j', (theme) => {
		expect(validateTheme(theme)).toBe(false);
		expect(() => parseThemeCode(JSON.stringify(theme))).toThrow('This theme is invaild');
	});

	test('rejects non-JSON code highlighter overrides', () => {
		expect(
			validateTheme({
				...validTheme,
				codeHighlighter: { base: '_none_', overrides: { transform: () => null } },
			}),
		).toBe(false);
	});

	test('rejects circular code highlighter overrides', () => {
		const overrides: Record<string, unknown> = {};
		overrides['self'] = overrides;

		expect(
			validateTheme({
				...validTheme,
				codeHighlighter: { base: '_none_', overrides },
			}),
		).toBe(false);
	});

	test.each([
		'@missing',
		'@accent',
		'not-a-color',
		':unknown<1<@bg',
		':alpha<Infinity<@bg',
		':alpha<1junk<@bg',
		':alpha<1',
	])('rejects a theme with an invalid color expression: %s', (accent) => {
		const code = JSON.stringify({
			...validTheme,
			props: { accent },
		});

		expect(() => parseThemeCode(code)).toThrow('This theme is invaild');
		expect(parseThemeOrNull(code)).toBeNull();
	});
});

// 起動時はサーバーが JSON に変換した既定テーマを読む。JSON5 を読み込まずに、同じ検証を通す。
describe('parseThemeJsonOrNull', () => {
	test('reads a theme delivered as JSON', () => {
		expect(parseThemeJsonOrNull(JSON.stringify(validTheme))).toStrictEqual(validTheme);
	});

	test('returns null for malformed JSON, invalid themes and missing values', () => {
		expect(parseThemeJsonOrNull('{')).toBeNull();
		expect(parseThemeJsonOrNull(JSON.stringify({ ...validTheme, props: null }))).toBeNull();
		expect(parseThemeJsonOrNull(null)).toBeNull();
		expect(parseThemeJsonOrNull(undefined)).toBeNull();
	});
});
