/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Vue Ref を IndexedDB に保存する経路では structuredClone が使えないため、対象型を再帰的に複製する。
// http://var.blog.jp/archives/86038606.html
// https://github.com/misskey-dev/misskey/pull/8098#issuecomment-1114144045

export type Cloneable =
	| string
	| number
	| boolean
	| null
	| undefined
	| { [key: string]: Cloneable }
	| { [key: number]: Cloneable }
	| { [key: symbol]: Cloneable }
	| Cloneable[];

export function deepClone<T extends Cloneable>(x: T): T {
	if (typeof x === 'object') {
		if (x === null) return x;
		if (Array.isArray(x)) return x.map(deepClone) as T;
		const obj = {} as Record<string | number | symbol, Cloneable>;
		for (const [k, v] of Object.entries(x)) {
			obj[k] = v === undefined ? undefined : deepClone(v);
		}
		return obj as T;
	} else {
		return x;
	}
}
