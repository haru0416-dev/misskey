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
 * 配列要素の重複を禁止する。Zod に組み込みの uniqueItems が無いため refine で補う。
 * 要素はプリミティブ (string/number) 前提。
 *
 * refine の内容は `z.toJSONSchema()` からは見えないため、同じ制約を `.meta()` にも載せる。
 * 載せないと OpenAPI (`/api.json`) から重複禁止の宣言が消える。
 */
export function uniqueItems<T extends z.ZodType>(schema: z.ZodArray<T>): z.ZodArray<T> {
	return schema
		.refine((items) => new Set(items).size === items.length, { message: 'must NOT have duplicate items' })
		.meta({ uniqueItems: true });
}

/**
 * ID とタイムスタンプによるページネーションの共通パラメータ。
 * `z.object({ ...paginationParams, ... })` のように展開して使う。
 *
 * スキーマは不変なので実体を共有してよい (`toJSONSchema` は使い回しを `$ref` にせず展開する)。
 */
export const paginationParams = {
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.int().optional(),
	untilDate: z.int().optional(),
};
