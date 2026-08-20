/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';

/** Misskey の ID 形式。 */
export function misskeyId(): z.ZodString {
	return z
		.string()
		.regex(/^[a-zA-Z0-9]+$/, { message: 'must match format "misskey:id"' })
		.meta({ format: 'misskey:id' });
}

/**
 * 配列要素の重複を禁止する。
 * Zod に組み込みの uniqueItems が無いため refine で補う。要素はプリミティブ (string/number) 前提。
 * `.refine()` は array 固有のメソッド (`.min()`/`.max()` 等) を消費するため、必ず最後に適用すること。
 */
export function uniqueItems<T extends z.ZodType>(schema: z.ZodArray<T>): z.ZodType<z.infer<T>[]> {
	return schema.refine((items) => new Set(items).size === items.length, { message: 'must NOT have duplicate items' });
}
