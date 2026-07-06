/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { invalidParamError } from './error.js';

export function parseHonoApiParams<Z extends z.ZodType>(schema: Z, body: Record<string, unknown>): z.infer<Z> {
	const result = schema.safeParse(body);

	if (!result.success) {
		const issue = result.error.issues[0];
		throw invalidParamError({
			param: issue?.path.join('.') ?? '',
			reason: issue?.message ?? 'invalid parameter',
		});
	}

	return result.data;
}
