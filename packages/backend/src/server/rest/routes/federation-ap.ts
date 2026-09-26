/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertTokenPermission, authenticateApiToken } from '../auth/auth.js';
import { rolePermissionDeniedError } from '../error.js';
import { handleApiEndpoint, handleApiEndpoints } from '../endpoint-info.js';
import { federationStatsParamDef, handleApiFederationStats } from '../activitypub/federation.js';
import { handleApiFetchExternalResources } from '../activitypub/fetch-external-resources.js';
import { handleApiApGet, handleApiApShow } from '../activitypub/ap.js';
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
import { endpointHandler, endpointHandlerAnonymous } from '../endpoint-handlers.js';
import { queryToApiBody } from '../string-params.js';

export function registerFederationApRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post(
		'/endpoints',
		endpointHandlerAnonymous(deps, 'endpoints', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiEndpoints()),
		),
	);

	app.post(
		'/endpoint',
		endpointHandlerAnonymous(deps, 'endpoint', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiEndpoint(body)),
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

	app.post(
		'/ap/show',
		endpointHandler(deps, 'ap/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiApShow(deps, auth.user, body)),
		),
	);

	app.post(
		'/fetch-external-resources',
		endpointHandler(deps, 'fetch-external-resources', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiFetchExternalResources(deps, auth.user, body)),
		),
	);
}
