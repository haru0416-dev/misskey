/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { normalizeBrandingJsonSettings } from '@/features/admin-tools/admin-branding.js';

const theme = (base: 'light' | 'dark') => `{
	id: '${base}-theme',
	name: '${base} theme',
	author: 'tester',
	base: '${base}',
	props: { accent: '#123456' },
}`;

describe('admin branding JSON settings', () => {
	test('normalizes valid JSON5 settings', () => {
		expect(normalizeBrandingJsonSettings({
			defaultLightTheme: theme('light'),
			defaultDarkTheme: theme('dark'),
			manifestJsonOverride: "{ name: 'Misskey', display: 'standalone', }",
		})).toStrictEqual({
			success: true,
			value: {
				defaultLightTheme: theme('light'),
				defaultDarkTheme: theme('dark'),
				manifestJsonOverride: '{"name":"Misskey","display":"standalone"}',
			},
		});
	});

	test('normalizes empty optional values', () => {
		expect(normalizeBrandingJsonSettings({
			defaultLightTheme: '  ',
			defaultDarkTheme: null,
			manifestJsonOverride: '',
		})).toStrictEqual({
			success: true,
			value: {
				defaultLightTheme: null,
				defaultDarkTheme: null,
				manifestJsonOverride: '{}',
			},
		});
	});

	test.each([
		['defaultLightTheme', '{', theme('dark'), '{}'],
		['defaultLightTheme', theme('dark'), theme('dark'), '{}'],
		['defaultDarkTheme', theme('light'), '{', '{}'],
		['defaultDarkTheme', theme('light'), theme('light'), '{}'],
		['manifestJsonOverride', theme('light'), theme('dark'), '{'],
		['manifestJsonOverride', theme('light'), theme('dark'), '[]'],
		['manifestJsonOverride', theme('light'), theme('dark'), 'null'],
	] as const)('rejects an invalid %s value', (field, light, dark, manifest) => {
		expect(normalizeBrandingJsonSettings({
			defaultLightTheme: light,
			defaultDarkTheme: dark,
			manifestJsonOverride: manifest,
		})).toStrictEqual({ success: false, field });
	});
});
