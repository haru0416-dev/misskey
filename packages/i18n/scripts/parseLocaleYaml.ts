/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

type BunGlobal = typeof globalThis & {
	Bun: {
		YAML: {
			parse(source: string): unknown;
		};
	};
};

const backspaceRegExp = new RegExp(String.fromCodePoint(0x08), 'g');

export function parseLocaleYaml<T>(source: string): T {
	return (globalThis as BunGlobal).Bun.YAML.parse(source.replace(backspaceRegExp, '')) as T;
}
