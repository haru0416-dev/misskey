/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { IObject } from '@/core/activitypub/type.js';
import { parseHonoApiParams } from './hono-api-validation.js';
import { resolveApObjectForHonoApi, type HonoApiApResolveDependencies } from './hono-api-ap-resolve.js';

const apGetParamDef = {
	type: 'object',
	properties: {
		uri: { type: 'string' },
	},
	required: ['uri'],
} as const;

type ApGetParams = {
	uri: string;
};

export async function handleHonoApiApGet(deps: HonoApiApResolveDependencies, body: Record<string, unknown>): Promise<IObject> {
	const params = parseHonoApiParams(apGetParamDef, body) as ApGetParams;
	return await resolveApObjectForHonoApi(deps, params.uri);
}
