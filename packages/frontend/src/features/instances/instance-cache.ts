/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { parseJsonObject } from '@shared/utility/server-context.js';

type CacheAction = 'clear' | 'none' | 'store';

export function resolveInitialInstanceMeta(input: {
	cachedMeta: string | null;
	cachedAt: string | null;
	providedMeta: string | null;
	providedAt: string | null;
}): {
	meta: Record<string, unknown> | null;
	cachedAt: number;
	cacheAction: CacheAction;
} {
	const cachedMeta = parseJsonObject(input.cachedMeta);
	const providedMeta = parseJsonObject(input.providedMeta);
	const parsedCachedAt = Number(input.cachedAt);
	const parsedProvidedAt = Number(input.providedAt);
	const cachedAt = Number.isSafeInteger(parsedCachedAt) && parsedCachedAt >= 0 ? parsedCachedAt : 0;
	const providedAt = Number.isSafeInteger(parsedProvidedAt) && parsedProvidedAt >= 0 ? parsedProvidedAt : 0;

	if (providedMeta != null && (cachedMeta == null || providedAt > cachedAt)) {
		return { meta: providedMeta, cachedAt: providedAt, cacheAction: 'store' };
	}
	if (cachedMeta == null) {
		return {
			meta: null,
			cachedAt: 0,
			cacheAction: input.cachedMeta == null && input.cachedAt == null ? 'none' : 'clear',
		};
	}
	return { meta: cachedMeta, cachedAt, cacheAction: 'none' };
}
