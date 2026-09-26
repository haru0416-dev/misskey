/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertTokenPermission, authenticateApiToken } from '../auth/auth.js';
import { rolePermissionDeniedError } from '../error.js';
import { handleApiEndpoints } from '../endpoint-info.js';
import { federationStatsParamDef, handleApiFederationStats } from '../activitypub/federation.js';
import { handleApiApGet } from '../activitypub/ap.js';
import { assertApiRateLimitForUser } from '../rate-limit.js';
import { isApiAdministrator } from '../role/role-policy.js';
import {
	jsonResponse,
	publicCacheHeadersWhenAnonymous,
	jsonBody,
	tokenFromRequest,
	runApiEndpoint,
	authenticateOptionalRequest,
} from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandlerAnonymous } from '../endpoint-handlers.js';
import { queryToApiBody } from '../string-params.js';

export function registerFederationApRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post(
		'/endpoints',
		endpointHandlerAnonymous(deps, 'endpoints', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiEndpoints()),
		),
	);

	app.get('/federation/stats', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = queryToApiBody(federationStatsParamDef, c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(
				c,
				await handleApiFederationStats(deps, auth.user, body),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.post('/federation/stats', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(
				c,
				await handleApiFederationStats(deps, auth.user, body),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.on(['POST', 'QUERY'], '/ap/get', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			if (!(await isApiAdministrator(deps, auth.user))) {
				throw rolePermissionDeniedError();
			}
			assertTokenPermission(auth, 'read:federation');
			await assertApiRateLimitForUser(
				deps,
				'ap/get',
				{
					duration: 60 * 60 * 1000,
					max: 30,
				},
				auth.user,
			);

			return jsonResponse(c, await handleApiApGet(deps, body));
		});
	});
}
