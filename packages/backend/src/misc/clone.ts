/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// structredCloneが遅いため
// SEE: http://var.blog.jp/archives/86038606.html

export type Cloneable = string | number | boolean | null | undefined | { [key: string]: Cloneable } | Cloneable[];

export type OmitUndefinedProperties<T extends object> = {
	[K in keyof T as undefined extends T[K] ? never : K]: T[K];
} & {
	[K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined>;
};

export function omitUndefined<T extends object>(value: T): OmitUndefinedProperties<T> {
	return Object.fromEntries(
		Object.entries(value).filter(([, item]) => item !== undefined),
	) as OmitUndefinedProperties<T>;
}

export function deepClone<T extends Cloneable>(x: T): T {
	if (typeof x === 'object') {
		if (x === null) return x;
		if (Array.isArray(x)) return x.map(deepClone) as T;
		const obj = {} as Record<string, Cloneable>;
		for (const [k, v] of Object.entries(x)) {
			obj[k] = v === undefined ? undefined : deepClone(v);
		}
		return obj as T;
	} else {
		return x;
	}
}
