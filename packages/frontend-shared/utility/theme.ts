/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import tinycolor from 'tinycolor2';
import JSON5 from 'json5';
import lightTheme from '@shared/themes/_light.json5';
import darkTheme from '@shared/themes/_dark.json5';
import type { BundledTheme } from 'shiki/themes';

type ThemeCodeHighlighterValue =
	| string
	| number
	| boolean
	| null
	| ThemeCodeHighlighterValue[]
	| { [key: string]: ThemeCodeHighlighterValue };
type ThemeCodeHighlighterOverrides = { [key: string]: ThemeCodeHighlighterValue };

export type Theme = {
	id: string;
	name: string;
	author: string;
	desc?: string;
	base?: 'dark' | 'light';
	props: Record<string, string>;
	codeHighlighter?:
		| {
				base: BundledTheme;
				overrides?: ThemeCodeHighlighterOverrides;
		  }
		| {
				base: '_none_';
				overrides: ThemeCodeHighlighterOverrides;
		  };
};

export type CompiledTheme = Record<string, string>;

const MAX_THEME_REFERENCE_DEPTH = 8;

export const themeProps = Object.keys(lightTheme.props).filter((key) => !key.startsWith('X'));

export const getBuiltinThemes = () =>
	Promise.all(
		[
			'l-erebia',
			'l-light',
			'l-coffee',
			'l-apricot',
			'l-rainy',
			'l-botanical',
			'l-vivid',
			'l-cherry',
			'l-sushi',
			'l-u0',

			'd-erebia',
			'd-dark',
			'd-persimmon',
			'd-astro',
			'd-future',
			'd-botanical',
			'd-green-lime',
			'd-green-orange',
			'd-cherry',
			'd-ice',
			'd-u0',
		].map((name) => import(`@shared/themes/${name}.json5`).then(({ default: _default }): Theme => _default)),
	);

function getThemeReferenceColor(theme: Theme, key: string, stack: string[], depth: number): tinycolor.Instance {
	if (depth >= MAX_THEME_REFERENCE_DEPTH) {
		throw new Error('Theme reference limit exceeded');
	}

	if (stack.includes(key)) {
		throw new Error('Theme contains circular references');
	}

	const nextValue = theme.props[key];
	if (typeof nextValue !== 'string') {
		throw new Error(`Theme references missing property: ${key}`);
	}

	return getColor(theme, nextValue, [...stack, key], depth + 1);
}

function getColor(theme: Theme, val: string, stack: string[] = [], depth = 0): tinycolor.Instance {
	if (val[0] === '@') {
		return getThemeReferenceColor(theme, val.substring(1), stack, depth);
	} else if (val[0] === '$') {
		return getThemeReferenceColor(theme, val, stack, depth);
	} else if (val[0] === ':') {
		if (depth >= MAX_THEME_REFERENCE_DEPTH) {
			throw new Error('Theme reference limit exceeded');
		}

		const parts = val.split('<');
		const funcTxt = parts.shift();
		const argTxt = parts.shift();

		if (funcTxt && argTxt?.trim()) {
			const func = funcTxt.substring(1);
			const arg = Number(argTxt);
			if (!Number.isFinite(arg) || parts.length === 0) {
				throw new Error(`Theme contains invalid function: ${val}`);
			}
			const color = getColor(theme, parts.join('<'), stack, depth + 1);

			switch (func) {
				case 'darken':
					return color.darken(arg);
				case 'lighten':
					return color.lighten(arg);
				case 'alpha':
					return color.setAlpha(arg);
				case 'hue':
					return color.spin(arg);
				case 'saturate':
					return color.saturate(arg);
				default:
					throw new Error(`Theme contains unknown function: ${func}`);
			}
		}

		throw new Error(`Theme contains invalid function: ${val}`);
	}

	const color = tinycolor(val);
	if (!color.isValid()) {
		throw new Error(`Theme contains invalid color: ${val}`);
	}
	return color;
}

export function compile(theme: Theme): CompiledTheme {
	const base = theme.base === 'dark' ? darkTheme : theme.base === 'light' ? lightTheme : null;
	const resolvedTheme: Theme = base == null ? theme : { ...theme, props: { ...base.props, ...theme.props } };
	const props = {} as CompiledTheme;

	for (const [k, v] of Object.entries(resolvedTheme.props)) {
		if (k.startsWith('$')) continue;

		props[k] = v.startsWith('"') ? v.replace(/^"\s*/, '') : genValue(getColor(resolvedTheme, v));
	}

	return Object.fromEntries(Object.entries(props).filter(([key]) => themeProps.includes(key))) as CompiledTheme;
}

function genValue(c: tinycolor.Instance): string {
	return c.toRgbString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

type ThemeCandidate = Record<string, unknown> & {
	id?: unknown;
	name?: unknown;
	author?: unknown;
	desc?: unknown;
	base?: unknown;
	props?: unknown;
	codeHighlighter?: unknown;
};

type ThemeCodeHighlighterCandidate = Record<string, unknown> & {
	base?: unknown;
	overrides?: unknown;
};

function isJsonValue(value: unknown, ancestors = new Set<object>()): value is ThemeCodeHighlighterValue {
	if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
		return true;
	if (typeof value !== 'object') return false;
	if (ancestors.has(value)) return false;

	const nextAncestors = new Set(ancestors).add(value);
	if (Array.isArray(value)) return value.every((item) => isJsonValue(item, nextAncestors));
	if (!isRecord(value)) return false;
	return Object.values(value).every((item) => isJsonValue(item, nextAncestors));
}

export function validateTheme(theme: unknown): theme is Theme {
	if (!isRecord(theme)) return false;
	const candidate = theme as ThemeCandidate;
	if (typeof candidate.id !== 'string') return false;
	if (typeof candidate.name !== 'string') return false;
	if (typeof candidate.author !== 'string') return false;
	if (candidate.desc !== undefined && typeof candidate.desc !== 'string') return false;
	if (candidate.base !== 'light' && candidate.base !== 'dark') return false;
	if (!isRecord(candidate.props) || !Object.values(candidate.props).every((value) => typeof value === 'string'))
		return false;
	if (candidate.codeHighlighter !== undefined) {
		if (!isRecord(candidate.codeHighlighter)) return false;
		const codeHighlighter = candidate.codeHighlighter as ThemeCodeHighlighterCandidate;
		if (typeof codeHighlighter.base !== 'string') return false;
		if (
			codeHighlighter.overrides !== undefined &&
			(!isRecord(codeHighlighter.overrides) || !isJsonValue(codeHighlighter.overrides))
		)
			return false;
		if (codeHighlighter.base === '_none_' && codeHighlighter.overrides === undefined) return false;
	}
	return true;
}

export function parseThemeCode(code: string): Theme {
	let theme;

	try {
		theme = JSON5.parse(code);
	} catch (_) {
		throw new Error('Failed to parse theme json', { cause: _ });
	}
	if (!validateTheme(theme)) {
		throw new Error('This theme is invaild');
	}
	try {
		compile(theme);
	} catch (_) {
		throw new Error('This theme is invaild', { cause: _ });
	}

	return theme;
}

export function parseThemeOrNull(code: string | null | undefined): Theme | null {
	if (code == null) return null;

	try {
		return parseThemeCode(code);
	} catch {
		return null;
	}
}
