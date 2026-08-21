/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import { languages, primaries } from './const.js';
import type { Locale } from './autogen/locale.js';
import type { ILocale, ParameterizedString } from './types.js';

type Language = typeof languages[number];

type PrimaryLang = keyof typeof primaries;

type Locales = Record<Language, ILocale>;

const backspaceRegExp = new RegExp(String.fromCodePoint(0x08), 'g');
const upstreamBrandPaths = new Set([
	'aboutMisskey',
	'chooseServerOnMisskeyHub',
	'pleaseDonate',
	'_aboutMisskey.about',
	'_aboutMisskey.thisIsModifiedVersion',
	'_aboutMisskey.translation',
	'_aboutMisskey.donate',
	'_aboutErebia.about',
	'_aboutErebia.basedOnMisskey',
	'_aboutErebia.values',
]);

function merge<T extends ILocale>(...args: (T | ILocale | undefined)[]): T {
	return args.reduce<ILocale>((a, c) => ({
		...a,
		...c,
		...Object.entries(a)
			.filter(([k]) => c && typeof c[k] === 'object')
			.reduce<Record<string, ILocale[string]>>((acc, [k, v]) => {
				acc[k] = merge(v as ILocale, (c as ILocale)[k] as ILocale);
				return acc;
			}, {}),
	}), {} as ILocale) as T;
}

// YAMLを壊すバックスペース文字を除去する。
function clean(text: string) {
	return text.replace(backspaceRegExp, '');
}

// 空文字列はフォールバックを無効化するため、プロパティを削除する。
function removeEmpty<T extends ILocale>(obj: T): T {
	for (const [k, v] of Object.entries(obj)) {
		if (v === '') {
			delete obj[k];
		} else if (typeof v === 'object') {
			removeEmpty(v as ILocale);
		}
	}
	return obj;
}

function applyProductBranding<T extends ILocale>(obj: T, parentPath = ''): T {
	const mutableObj = obj as ILocale;
	for (const [key, value] of Object.entries(obj)) {
		const path = parentPath === '' ? key : `${parentPath}.${key}`;
		if (typeof value === 'string' && !upstreamBrandPaths.has(path)) {
			const misskeyHub = '\0MISSKEY_HUB\0';
			const mfm = '\0MISSKEY_FLAVOURED_MARKDOWN\0';
			const reversiHashtag = '\0MISSKEY_REVERSI_HASHTAG\0';
			const misskeyMisskey = '\0MISSKEY_MISSKEY\0';
			let brandedValue = value
				.replaceAll('Misskey Hub', misskeyHub)
				.replaceAll('Misskey Flavoured Markdown', mfm)
				.replaceAll('#MisskeyReversi', reversiHashtag)
				.replaceAll('Misskey-Misskey', misskeyMisskey)
				.replaceAll('Misskey', 'Erebia')
				.replaceAll('Mískey', 'Erebia')
				.replaceAll('ميسكي', 'Erebia')
				.replaceAll(misskeyHub, 'Misskey Hub')
				.replaceAll(mfm, 'Misskey Flavoured Markdown')
				.replaceAll(reversiHashtag, '#MisskeyReversi')
				.replaceAll(misskeyMisskey, 'Misskey-Misskey');
			if (path === 'repositoryUrlDescription') {
				brandedValue = brandedValue.replaceAll('https://github.com/misskey-dev/misskey', 'https://github.com/haru0416-dev/misskey');
			}
			mutableObj[key] = brandedValue;
		} else if (typeof value === 'object') {
			applyProductBranding(value as ILocale, path);
		}
	}
	return obj;
}

function build(): Record<Language, Locale> {
	// Vitest のモジュール評価を安定させるため、import.meta.url をローカル変数へ退避する。
	// https://github.com/vitest-dev/vitest/issues/3988#issuecomment-1686599577
	// https://github.com/misskey-dev/misskey/pull/14057#issuecomment-2192833785
	const metaUrl = import.meta.url;
	const locales = languages.reduce<Locales>((a, lang) => {
		a[lang] = (yaml.load(clean(fs.readFileSync(new URL(`./locales/${lang}.yml`, metaUrl), 'utf-8'))) ?? {}) as ILocale;
		return a;
	}, {} as Locales);

	removeEmpty(locales);

	return Object.entries(locales).reduce<Record<Language, Locale>>((a, [k, v]) => {
		const [lang = k] = k.split('-');
		const key = k as Language;

		switch (key) {
			case 'ja-JP':
				a[key] = v as Locale;
				break;
			case 'ja-KS':
			case 'en-US':
				a[key] = merge<Locale>(locales['ja-JP'] as Locale, v);
				break;
			default: {
				const primaryLang = lang as PrimaryLang;
				const primaryKey = (lang in primaries ? `${lang}-${primaries[primaryLang]}` : undefined) as Language | undefined;
				a[key] = merge<Locale>(
					locales['ja-JP'] as Locale,
					locales['en-US'],
					primaryKey ? locales[primaryKey] : {},
					v,
				);
				break;
			}
		}

		applyProductBranding(a[key]);

		return a;
	}, {} as Record<Language, Locale>);
}

const locales = build() as {
	[lang: string]: Locale;
};

/** Service Worker が HTTP 経由で取得する locale JSON を書き出す。 */
async function writeFrontendLocalesJson(
	destDir: string,
	version: string,
	builtLocales: Readonly<Record<string, Locale>> = build(),
): Promise<void> {
	const { mkdir, writeFile } = await import('node:fs/promises');
	const { resolve } = await import('node:path');

	await mkdir(destDir, { recursive: true });

	const v = { '_version_': version };

	await Promise.all(Object.entries(builtLocales).map(([lang, locale]) =>
		writeFile(
			resolve(destDir, `${lang}.${version}.json`),
			JSON.stringify({ ...locale, ...v }),
			'utf-8',
		),
	));
}

export { locales, languages, build, writeFrontendLocalesJson };
export type { Language, Locale, ILocale, ParameterizedString };
export default locales;
