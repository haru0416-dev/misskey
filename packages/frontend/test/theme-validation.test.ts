/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { compile, getBuiltinThemes, parseThemeCode, parseThemeOrNull, validateTheme } from '@shared/utility/theme.js';
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
		expect(compile(validTheme).accent).toBe('rgb(171, 205, 239)');
	});

	test('compiles every bundled theme', async () => {
		for (const theme of await getBuiltinThemes()) {
			expect(() => compile(theme)).not.toThrow();
		}
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
		overrides.self = overrides;

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
