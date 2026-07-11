/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import JSON5 from 'json5';
import { parseThemeOrNull } from '@shared/utility/theme.js';

export type BrandingJsonField = 'defaultLightTheme' | 'defaultDarkTheme' | 'manifestJsonOverride';

export type NormalizedBrandingJsonSettings = {
	defaultLightTheme: string | null;
	defaultDarkTheme: string | null;
	manifestJsonOverride: string;
};

type NormalizeResult =
	| { success: true; value: NormalizedBrandingJsonSettings }
	| { success: false; field: BrandingJsonField };

function normalizeTheme(code: string | null, expectedBase: 'light' | 'dark'): string | null | undefined {
	if (code == null || code.trim() === '') return null;
	const theme = parseThemeOrNull(code);
	return theme?.base === expectedBase ? code : undefined;
}

export function normalizeBrandingJsonSettings(input: {
	defaultLightTheme: string | null;
	defaultDarkTheme: string | null;
	manifestJsonOverride: string;
}): NormalizeResult {
	const defaultLightTheme = normalizeTheme(input.defaultLightTheme, 'light');
	if (defaultLightTheme === undefined) return { success: false, field: 'defaultLightTheme' };

	const defaultDarkTheme = normalizeTheme(input.defaultDarkTheme, 'dark');
	if (defaultDarkTheme === undefined) return { success: false, field: 'defaultDarkTheme' };

	let manifestJsonOverride: unknown;
	try {
		manifestJsonOverride = input.manifestJsonOverride.trim() === '' ? {} : JSON5.parse(input.manifestJsonOverride);
	} catch {
		return { success: false, field: 'manifestJsonOverride' };
	}
	if (typeof manifestJsonOverride !== 'object' || manifestJsonOverride === null || Array.isArray(manifestJsonOverride)) {
		return { success: false, field: 'manifestJsonOverride' };
	}

	return {
		success: true,
		value: {
			defaultLightTheme,
			defaultDarkTheme,
			manifestJsonOverride: JSON.stringify(manifestJsonOverride),
		},
	};
}
