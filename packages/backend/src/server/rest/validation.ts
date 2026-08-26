/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { omitUndefined, type OmitUndefinedProperties } from '@/misc/clone.js';
import { invalidParamError } from './error.js';

type ExactOptionalProperties<T> = T extends Record<string, unknown> ? OmitUndefinedProperties<T> : T;

export function parseHonoApiParams<Z extends z.ZodType>(
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
