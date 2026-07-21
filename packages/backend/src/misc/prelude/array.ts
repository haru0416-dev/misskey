/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Predicate } from './relation.js';


export function countIf<T>(f: Predicate<T>, xs: T[]): number {
	return xs.filter(f).length;
}

export function count<T>(a: T, xs: T[]): number {
	return countIf(x => x === a, xs);
}

export function concat<T>(xss: T[][]): T[] {
	return ([] as T[]).concat(...xss);
}

export function intersperse<T>(sep: T, xs: T[]): T[] {
	return concat(xs.map(x => [sep, x])).slice(1);
}

export function erase<T>(a: T, xs: T[]): T[] {
	return xs.filter(x => x !== a);
}

export function difference<T>(xs: T[], ys: T[]): T[] {
	return xs.filter(x => !ys.includes(x));
}

export function unique<T>(xs: T[]): T[] {
	return [...new Set(xs)];
}

export function sum(xs: number[]): number {
	return xs.reduce((a, b) => a + b, 0);
}

export function maximum(xs: number[]): number {
	return Math.max(...xs);
}

export function lessThan(xs: number[], ys: number[]): boolean {
	for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
		const x = xs[i];
		const y = ys[i];
		if (x == null || y == null) throw new Error('Array contains an empty element');
		if (x < y) return true;
		if (x > y) return false;
	}
	return xs.length < ys.length;
}

export function takeWhile<T>(f: Predicate<T>, xs: T[]): T[] {
	const ys = [];
	for (const x of xs) {
		if (f(x)) {
			ys.push(x);
		} else {
			break;
		}
	}
	return ys;
}

export function cumulativeSum(xs: number[]): number[] {
	let total = 0;
	return xs.map(value => total += value);
}

export function toArray<T>(x: T | T[] | undefined): T[] {
	return Array.isArray(x) ? x : x != null ? [x] : [];
}

export function toSingle<T>(x: T | T[] | undefined): T | undefined {
	return Array.isArray(x) ? x[0] : x;
}
