/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function concat<T>(xss: T[][]): T[] {
	return ([] as T[]).concat(...xss);
}

export function intersperse<T>(sep: T, xs: T[]): T[] {
	return concat(xs.map((x) => [sep, x])).slice(1);
}

export function unique<T>(xs: T[]): T[] {
	return [...new Set(xs)];
}

export function maximum(xs: number[]): number {
	return Math.max(...xs);
}

export function toArray<T>(x: T | T[] | undefined): T[] {
	return Array.isArray(x) ? x : x != null ? [x] : [];
}

export function toSingle<T>(x: T | T[] | undefined): T | undefined {
	return Array.isArray(x) ? x[0] : x;
}
