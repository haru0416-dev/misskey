/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

type Predicate<T> = (x: T) => boolean;

export function countIf<T>(f: Predicate<T>, xs: T[]): number {
	let count = 0;
	for (const x of xs) {
		if (f(x)) {
			count++;
		}
	}
	return count;
}

export function concat<T>(xss: T[][]): T[] {
	return ([] as T[]).concat(...xss);
}

export function intersperse<T>(sep: T, xs: T[]): T[] {
	if (xs.length === 0) {
		return [];
	}
	const result = new Array<T>(xs.length * 2 - 1);
	result[0] = xs[0]!;
	for (let i = 1; i < xs.length; i++) {
		result[i * 2 - 1] = sep;
		result[i * 2] = xs[i]!;
	}
	return result;
}

export function erase<T>(a: T, xs: T[]): T[] {
	return xs.filter((x) => x !== a);
}

export function difference<T>(xs: T[], ys: T[]): T[] {
	const excluded = new Set(ys);
	return xs.filter((x) => !excluded.has(x));
}

export function unique<T>(xs: T[]): T[] {
	return [...new Set(xs)];
}

export function uniqueBy<TValue, TKey>(values: TValue[], keySelector: (value: TValue) => TKey): TValue[] {
	const map = new Map<TKey, TValue>();

	for (const value of values) {
		const key = keySelector(value);
		if (!map.has(key)) {
			map.set(key, value);
		}
	}

	return [...map.values()];
}

export function sum(xs: number[]): number {
	return xs.reduce((a, b) => a + b, 0);
}

export function maximum(xs: number[]): number {
	let result = -Infinity;
	for (const x of xs) {
		if (x > result) {
			result = x;
		}
	}
	return result;
}
