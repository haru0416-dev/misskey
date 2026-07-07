/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import type * as Redis from 'ioredis';
import { z } from 'zod';
import type { Config } from '@/config.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import type { MiLocalUser } from '@/models/User.js';
import { HonoApiError, rateLimitExceededError } from './error.js';
import { isHonoApiRateLimited } from './rate-limit.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiFetchExternalResourcesDependencies = {
	config: Config;
	redis: Redis.Redis;
	httpRequestService: HttpRequestService;
};

export const fetchExternalResourcesParamDef = z.object({
	url: z.string(),
	hash: z.string(),
});

type FetchExternalResourcesParams = {
	url: string;
	hash: string;
};

type ExternalResourceResponse = {
	type: string;
	data: string;
};

const invalidSchema = {
	message: 'External resource returned invalid schema.',
	code: 'EXT_RESOURCE_RETURNED_INVALID_SCHEMA',
	id: 'bb774091-7a15-4a70-9dc5-6ac8cf125856',
};

const hashUnmatched = {
	message: 'Hash did not match.',
	code: 'EXT_RESOURCE_HASH_DIDNT_MATCH',
	id: '693ba8ba-b486-40df-a174-72f8279b56a4',
};

function clientError(error: { message: string; code: string; id: string }): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: error.message,
		code: error.code,
		id: error.id,
	});
}

export async function handleHonoApiFetchExternalResources(
	deps: HonoApiFetchExternalResourcesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<ExternalResourceResponse> {
	const params = parseHonoApiParams(fetchExternalResourcesParamDef, body);

	if (await isHonoApiRateLimited(deps, {
		key: 'fetch-external-resources',
		duration: 60 * 60 * 1000,
		max: 50,
	}, me.id)) {
		throw rateLimitExceededError();
	}

	const res = await deps.httpRequestService.getJson<ExternalResourceResponse>(params.url);

	if (!res.data || !res.type) {
		throw clientError(invalidSchema);
	}

	const resHash = createHash('sha512').update(res.data.replace(/\r\n/g, '\n')).digest('hex');
	if (resHash !== params.hash) {
		throw clientError(hashUnmatched);
	}

	return {
		type: res.type,
		data: res.data,
	};
}
