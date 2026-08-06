/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type Promiseable<T> = {
	[K in keyof T]: Promise<T[K]> | T[K];
};

export async function awaitAll<T>(obj: Promiseable<T>): Promise<T> {
	const target = {} as T;
	const keys = Object.keys(obj) as unknown as (keyof T)[];
	const values = Object.values(obj as object);

	const resolvedValues = await Promise.all(
		values.map((value) =>
			!value || typeof value !== 'object' || value.constructor.name !== 'Object' ? value : awaitAll(value),
		),
	);

	for (let i = 0; i < keys.length; i++) {
		const key = keys[i];
		if (key == null) continue;
		target[key] = resolvedValues[i];
	}

	return target;
}
