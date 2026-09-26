/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { z } from 'zod';
import { omitUndefined } from '@/misc/clone.js';
import type { OmitUndefinedProperties } from '@/misc/clone.js';
import { invalidParamError } from './error.js';

type ExactOptionalProperties<T> = T extends Record<string, unknown> ? OmitUndefinedProperties<T> : T;

/** parseApiParams が返す検証済みの入力。宣言から登録されるエンドポイントの実装はこの型で入力を受け取る。 */
export type ApiParams<Z extends z.ZodType> = ExactOptionalProperties<z.infer<Z>>;

export function parseApiParams<Z extends z.ZodType>(
	schema: Z,
	body: Record<string, unknown>,
): ExactOptionalProperties<z.infer<Z>> {
	const result = schema.safeParse(body);

	if (!result.success) {
		const issue = result.error.issues[0];
		throw invalidParamError({
			param: issue?.path.join('.') ?? '',
			reason: issue?.message ?? 'invalid parameter',
		});
	}

	if (result.data != null && typeof result.data === 'object' && !Array.isArray(result.data)) {
		return omitUndefined(result.data) as ExactOptionalProperties<z.infer<Z>>;
	}

	return result.data as ExactOptionalProperties<z.infer<Z>>;
}
