/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ILocale, ParameterizedString } from 'i18n';

type InterpolationArgs = Readonly<Record<string, string | number>>;
type Interpolator = (arg: InterpolationArgs) => string;
interface RuntimeTsx {
	[key: string]: RuntimeTsx | Interpolator;
}

function isLocaleObject(value: unknown): value is ILocale {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getLocaleValue(target: ILocale, key: string | symbol): unknown {
	return (target as unknown as Record<PropertyKey, unknown>)[key];
}

function compileInterpolator(value: string, onMissing?: (expression: string) => void): Interpolator | null {
	const quasis: string[] = [];
	const expressions: string[] = [];
	let cursor = 0;
	let searchCursor = 0;

	while (true) {
		const start = value.indexOf('{', searchCursor);
		if (start === -1) {
			quasis.push(value.slice(cursor));
			break;
		}

		const end = value.indexOf('}', start + 1);
		if (end === -1) {
			quasis.push(value.slice(cursor));
			break;
		}
		const nestedStart = value.indexOf('{', start + 1);
		if (nestedStart !== -1 && nestedStart < end) {
			searchCursor = nestedStart;
			continue;
		}

		const expression = value.slice(start + 1, end);
		if (expression === '') {
			searchCursor = end + 1;
			continue;
		}

		quasis.push(value.slice(cursor, start));
		expressions.push(expression);
		cursor = end + 1;
		searchCursor = cursor;
	}

	if (expressions.length === 0) return null;

	return (arg) => {
		let str = quasis[0] ?? '';
		for (let i = 0; i < expressions.length; i++) {
			const expression = expressions[i]!;
			const replacement = arg[expression];
			if (replacement === undefined) {
				onMissing?.(expression);
				str += `{${expression}}`;
			} else {
				str += replacement;
			}
			str += quasis[i + 1] ?? '';
		}
		return str;
	};
}

type Tsx<T extends ILocale> = {
	// `string extends T[K] ? never : K`で、パラメータを持たない文字列キーをTsx型から除外する。
	readonly [K in keyof T as string extends T[K] ? never : K]: T[K] extends ParameterizedString<infer P>
		? (arg: { readonly [_ in P]: string | number }) => string
		: // @ts-expect-error -- 証明省略
			Tsx<T[K]>;
};

export class I18n<T extends ILocale> {
	private tsxCache?: Tsx<T>;
	private devMode: boolean;

	constructor(
		public locale: T,
		devMode = false,
	) {
		this.devMode = devMode;
	}

	public get ts(): T {
		if (this.devMode) {
			class Handler implements ProxyHandler<ILocale> {
				get(target: ILocale, p: string | symbol): unknown {
					const value = getLocaleValue(target, p);

					if (isLocaleObject(value)) {
						return new Proxy(value, new Handler());
					}

					// パラメータ化された文字列 ({name} 等を含む) を .ts 経由で取得するのは
					// <I18n :src="i18n.ts.xxx"> にそのまま渡してスロットで埋める正規の用法であり、
					// この時点ではパラメータが充足されるかどうか判定できないので警告しない
					// (実際に引数を渡して埋める .tsx/.t() 側でのみ充足チェックを行う)。
					if (typeof value === 'string') {
						return value;
					}

					console.error(`Unexpected locale key: ${String(p)}`);

					// 開発サーバーの再ビルド中はlocaleが一時的に古くなることがある。
					// オブジェクトを返すとVueの検査でProxyの内部キーが追加のlocale検索になり、
					// 描画を壊すため、診断を残して安全な表示値を返す。
					return String(p);
				}
			}

			return new Proxy(this.locale, new Handler()) as T;
		}

		return this.locale;
	}

	public get tsx(): Tsx<T> {
		if (this.devMode) {
			if (this.tsxCache) {
				return this.tsxCache;
			}

			class Handler implements ProxyHandler<ILocale> {
				get(target: ILocale, p: string | symbol): unknown {
					const value = getLocaleValue(target, p);

					if (isLocaleObject(value)) {
						return new Proxy(value, new Handler());
					}

					if (typeof value === 'string') {
						const interpolator = compileInterpolator(value, (expression) => {
							console.error(`Missing locale parameters: ${expression} at ${String(p)}`);
						});
						if (interpolator == null) {
							console.error(`Unexpected locale key: ${String(p)}`);
							return () => value;
						}
						return interpolator;
					}

					console.error(`Unexpected locale key: ${String(p)}`);

					const fallback = () => String(p);
					return new Proxy(fallback, {
						get: (_target, nested) => new Proxy({} as ILocale, new Handler())[nested as keyof ILocale],
					});
				}
			}

			return (this.tsxCache = new Proxy(this.locale, new Handler()) as unknown as Tsx<T>);
		}

		if (this.tsxCache) {
			return this.tsxCache;
		}

		function build(target: ILocale): RuntimeTsx {
			const result: RuntimeTsx = {};

			for (const k in target) {
				if (!Object.hasOwn(target, k)) {
					continue;
				}

				const value = getLocaleValue(target, k);

				if (isLocaleObject(value)) {
					result[k] = build(value);
				} else if (typeof value === 'string') {
					const interpolator = compileInterpolator(value);
					if (interpolator != null) result[k] = interpolator;
				}
			}
			return result;
		}

		return (this.tsxCache = build(this.locale) as Tsx<T>);
	}
}
