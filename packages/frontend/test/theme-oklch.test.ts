/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { compile } from '@shared/utility/theme.js';
import darkErebia from '@shared/themes/d-erebia.json5';
import lightErebia from '@shared/themes/l-erebia.json5';
import type { Theme } from '@shared/utility/theme.js';

function themeWith(props: Record<string, string>): Theme {
	return {
		id: 'test',
		name: 'test',
		author: 'test',
		base: 'dark',
		props,
	};
}

describe('theme oklch support', () => {
	test('compiles oklch color to the equivalent sRGB value', () => {
		// oklch(0.663 0.159 279.5) == #8185f2 (丸め誤差 ±1/255)
		const compiled = compile(themeWith({ accent: 'oklch(0.663 0.159 279.5)' }));
		expect(compiled['accent']).toBe('rgb(129, 133, 242)');
	});

	test('supports percent lightness, deg hue and alpha', () => {
		const compiled = compile(themeWith({ accent: 'oklch(66.3% 0.159 279.5deg / 34.9%)' }));
		expect(compiled['accent']).toBe('rgba(129, 133, 242, 0.35)');
	});

	test('oklch value works as a reference target for theme functions', () => {
		const compiled = compile(
			themeWith({
				accent: 'oklch(0.663 0.159 279.5)',
				focus: ':alpha<0.3<@accent',
			}),
		);
		expect(compiled['focus']).toBe('rgba(129, 133, 242, 0.3)');
	});

	test('clamps out-of-gamut oklch instead of failing', () => {
		const compiled = compile(themeWith({ accent: 'oklch(0.5 0.4 145)' }));
		expect(compiled['accent']).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
	});

	test('rejects malformed oklch', () => {
		expect(() => compile(themeWith({ accent: 'oklch(foo bar baz)' }))).toThrow();
	});

	test('builtin Erebia themes compile', () => {
		for (const theme of [darkErebia, lightErebia]) {
			const compiled = compile(theme as Theme);
			expect(compiled['accent']).toMatch(/^rgb/);
			expect(compiled['bg']).toMatch(/^rgb/);
		}
	});
});
