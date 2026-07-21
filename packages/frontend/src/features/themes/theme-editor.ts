/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { genId } from '@/utility/id.js';

import type { Theme } from '@shared/utility/theme.js';
import { themeProps } from '@shared/utility/theme.js';

type Default = null;
export type Color = string;
type FuncName = 'alpha' | 'darken' | 'hue' | 'lighten' | 'saturate';
export type Func = { type: 'func'; name: FuncName; arg: number; value: string };
export type RefProp = { type: 'refProp'; key: string };
export type RefConst = { type: 'refConst'; key: string };
export type Css = { type: 'css'; value: string };

export type ThemeValue = Color | Func | RefProp | RefConst | Css | Default;

type ThemeViewModel = [string, ThemeValue][];

const supportedFunctions: FuncName[] = ['alpha', 'darken', 'hue', 'lighten', 'saturate'];

function isFuncName(value: string): value is FuncName {
	return supportedFunctions.includes(value as FuncName);
}

export const fromThemeString = (str?: string): ThemeValue => {
	if (!str) return null;
	if (str.startsWith(':')) {
		const parts = str.slice(1).split('<');
		const name = parts[0];
		const arg = Number.parseFloat(parts[1] ?? '');
		const rawValue = parts[2];
		if (
			parts.length !== 3 ||
			name == null ||
			!isFuncName(name) ||
			!Number.isFinite(arg) ||
			!rawValue?.startsWith('@') ||
			rawValue.length === 1
		) {
			return str;
		}
		const value = rawValue.slice(1);
		return { type: 'func', name, arg, value };
	} else if (str.startsWith('@')) {
		return {
			type: 'refProp',
			key: str.slice(1),
		};
	} else if (str.startsWith('$')) {
		return {
			type: 'refConst',
			key: str.slice(1),
		};
	} else if (str.startsWith('"')) {
		return {
			type: 'css',
			value: str.substring(1).trim(),
		};
	} else {
		return str;
	}
};

export const toThemeString = (value: Color | Func | RefProp | RefConst | Css) => {
	if (typeof value === 'string') return value;
	switch (value.type) {
		case 'func':
			return `:${value.name}<${value.arg}<@${value.value}`;
		case 'refProp':
			return `@${value.key}`;
		case 'refConst':
			return `$${value.key}`;
		case 'css':
			return `" ${value.value}`;
	}
};

const convertToMisskeyTheme = (
	vm: ThemeViewModel,
	name: string,
	desc: string,
	author: string,
	base: 'dark' | 'light',
): Theme => {
	const props = {} as { [key: string]: string };
	for (const [key, value] of vm) {
		if (value === null) continue;
		props[key] = toThemeString(value);
	}

	return {
		id: genId(),
		name,
		desc,
		author,
		props,
		base,
	};
};

const convertToViewModel = (theme: Theme): ThemeViewModel => {
	const vm: ThemeViewModel = [];
	// プロパティの登録
	vm.push(...themeProps.map((key) => [key, fromThemeString(theme.props[key])] as [string, ThemeValue]));

	// 定数の登録
	const consts = Object.keys(theme.props)
		.filter((k) => k.startsWith('$'))
		.map((k) => [k, fromThemeString(theme.props[k])] as [string, ThemeValue]);

	vm.push(...consts);
	return vm;
};
