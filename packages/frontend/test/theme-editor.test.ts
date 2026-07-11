/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { fromThemeString, toThemeString } from '@/utility/theme-editor.js';

describe('theme editor value conversion', () => {
	test.each(['alpha', 'darken', 'hue', 'lighten', 'saturate'] as const)('round-trips the %s function', (name) => {
		const source = `:${name}<0.5<@accent`;
		const value = fromThemeString(source);

		expect(value).toStrictEqual({ type: 'func', name, arg: 0.5, value: 'accent' });
		expect(value == null ? null : toThemeString(value)).toBe(source);
	});

	test.each([
		':',
		':alpha',
		':alpha<0.5',
		':alpha<invalid<@accent',
		':alpha<0.5<',
		':alpha<0.5<@',
		':unknown<0.5<@accent',
		':alpha<0.5<#ffffff',
		':alpha<0.5<:darken<0.2<@accent',
	])('preserves an unsupported value without throwing: %s', (source) => {
		expect(fromThemeString(source)).toBe(source);
	});
});
