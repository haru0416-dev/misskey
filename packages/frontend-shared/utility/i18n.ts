/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ILocale, ParameterizedString } from 'i18n';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TODO = any;

type Tsx<T extends ILocale> = {
	// `string extends T[K] ? never : K` part removes non-parameterized string keys from Tsx type.
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
			class Handler<TTarget extends ILocale> implements ProxyHandler<TTarget> {
				get(target: TTarget, p: string | symbol): unknown {
					const value = target[p as keyof TTarget];

					if (typeof value === 'object') {
						return new Proxy(value, new Handler<TTarget[keyof TTarget] & ILocale>());
					}

					// パラメータ化された文字列 ({name} 等を含む) を .ts 経由で取得するのは
					// <I18n :src="i18n.ts.xxx"> にそのまま渡してスロットで埋める正規の用法であり、
					// この時点ではパラメータが充足されるかどうか判定できないので警告しない
					// (実際に引数を渡して埋める .tsx/.t() 側でのみ充足チェックを行う)。
					if (typeof value === 'string') {
						return value;
					}

					console.error(`Unexpected locale key: ${String(p)}`);

					return new Proxy({} as any, new Handler<TTarget[keyof TTarget] & ILocale>());
				}
			}

			return new Proxy(this.locale, new Handler());
		}

		return this.locale;
	}

	public get tsx(): Tsx<T> {
		if (this.devMode) {
			if (this.tsxCache) {
				return this.tsxCache;
			}

			class Handler<TTarget extends ILocale> implements ProxyHandler<TTarget> {
				get(target: TTarget, p: string | symbol): unknown {
					const value = target[p as keyof TTarget];

					if (typeof value === 'object') {
						return new Proxy(value, new Handler<TTarget[keyof TTarget] & ILocale>());
					}

					if (typeof value === 'string') {
						const quasis: string[] = [];
						const expressions: string[] = [];
						let cursor = 0;

						while (~cursor) {
							const start = value.indexOf('{', cursor);

							if (!~start) {
								quasis.push(value.slice(cursor));
								break;
							}

							quasis.push(value.slice(cursor, start));

							const end = value.indexOf('}', start);

							expressions.push(value.slice(start + 1, end));

							cursor = end + 1;
						}

						if (!expressions.length) {
							console.error(`Unexpected locale key: ${String(p)}`);

							return () => value;
						}

						return (arg: TODO) => {
							let str = quasis[0];

							for (let i = 0; i < expressions.length; i++) {
								if (!Object.hasOwn(arg, expressions[i])) {
									console.error(`Missing locale parameters: ${expressions[i]} at ${String(p)}`);
								}

								str += arg[expressions[i]] + quasis[i + 1];
							}

							return str;
						};
					}

					console.error(`Unexpected locale key: ${String(p)}`);

					return new Proxy((() => p) as any, new Handler<TTarget[keyof TTarget] & ILocale>());
				}
			}

			return (this.tsxCache = new Proxy(this.locale, new Handler()) as unknown as Tsx<T>);
		}

		if (this.tsxCache) {
			return this.tsxCache;
		}

		function build(target: ILocale): Tsx<T> {
			const result = {} as Tsx<T>;

			for (const k in target) {
				if (!Object.hasOwn(target, k)) {
					continue;
				}

				const value = target[k as keyof typeof target];

				if (typeof value === 'object') {
					(result as TODO)[k] = build(value as ILocale);
				} else if (typeof value === 'string') {
					const quasis: string[] = [];
					const expressions: string[] = [];
					let cursor = 0;

					while (~cursor) {
						const start = value.indexOf('{', cursor);

						if (!~start) {
							quasis.push(value.slice(cursor));
							break;
						}

						quasis.push(value.slice(cursor, start));

						const end = value.indexOf('}', start);

						expressions.push(value.slice(start + 1, end));

						cursor = end + 1;
					}

					if (!expressions.length) {
						continue;
					}

					(result as TODO)[k] = (arg: TODO) => {
						let str = quasis[0];

						for (let i = 0; i < expressions.length; i++) {
							str += arg[expressions[i]] + quasis[i + 1];
						}

						return str;
					};
				}
			}
			return result;
		}

		return (this.tsxCache = build(this.locale));
	}

}
