/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import {
	assertCredential,
	assertSecureCredential,
	assertTokenPermission,
	authenticateHonoApiToken,
} from '../auth/auth.js';
import { rolePermissionDeniedError } from '../error.js';
import { handleHonoApiEndpoint, handleHonoApiEndpoints } from '../endpoint-info.js';
import {
	handleHonoApiFederationFollowers,
	handleHonoApiFederationFollowing,
	handleHonoApiFederationInstances,
	handleHonoApiFederationShowInstance,
	handleHonoApiFederationStats,
	handleHonoApiFederationUsers,
	normalizeHonoApiFederationQuery,
} from '../activitypub/federation.js';
import { handleHonoApiFetchExternalResources } from '../activitypub/fetch-external-resources.js';
import { handleHonoApiApGet, handleHonoApiApShow } from '../activitypub/ap.js';
import { handleHonoApiFederationUpdateRemoteUser } from '../activitypub/ap-person.js';
import { assertHonoApiRateLimitForUser } from '../rate-limit.js';
import { isHonoApiAdministrator } from '../role/role-policy.js';
import {
	jsonResponse,
	emptyResponse,
	publicCacheHeadersWhenAnonymous,
	jsonBody,
	tokenFromRequest,
	runApiEndpoint,
	authenticateOptionalRequest,
} from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandler, endpointHandlerAnonymous } from '../endpoint-handlers.js';

export function registerFederationApRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post(
		'/endpoints',
		endpointHandlerAnonymous(deps, 'endpoints', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiEndpoints()),
		),
	);

	app.post(
		'/endpoint',
		endpointHandlerAnonymous(deps, 'endpoint', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiEndpoint(body)),
		),
	);

	app.get('/federation/instances', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = normalizeHonoApiFederationQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(
				c,
				await handleHonoApiFederationInstances(deps, auth.user, body),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.on(['POST', 'QUERY'], '/federation/instances', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(
				c,
				await handleHonoApiFederationInstances(deps, auth.user, body),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.on(
		['POST', 'QUERY'],
		'/federation/show-instance',
		endpointHandlerAnonymous(deps, 'federation/show-instance', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiFederationShowInstance(deps, auth.user, body)),
		),
	);

	app.get('/federation/stats', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = normalizeHonoApiFederationQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(
				c,
				await handleHonoApiFederationStats(deps, auth.user, body),
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
				await handleHonoApiFederationStats(deps, auth.user, body),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.on(
		['POST', 'QUERY'],
		'/federation/users',
		endpointHandlerAnonymous(deps, 'federation/users', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiFederationUsers(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/federation/followers',
		endpointHandlerAnonymous(deps, 'federation/followers', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiFederationFollowers(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/federation/following',
		endpointHandlerAnonymous(deps, 'federation/following', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiFederationFollowing(deps, body)),
		),
	);

	app.on(['POST', 'QUERY'], '/ap/get', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			if (!(await isHonoApiAdministrator(deps, auth.user))) {
				throw rolePermissionDeniedError();
			}
			assertTokenPermission(auth, 'read:federation');
			await assertHonoApiRateLimitForUser(
				deps,
				'ap/get',
				{
					duration: 60 * 60 * 1000,
					max: 30,
				},
				auth.user,
			);

			return jsonResponse(c, await handleHonoApiApGet(deps, body));
		});
	});

	app.post(
		'/federation/update-remote-user',
		endpointHandlerAnonymous(deps, 'federation/update-remote-user', async ({ body, auth, c }) => {
			await handleHonoApiFederationUpdateRemoteUser(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/ap/show',
		endpointHandler(deps, 'ap/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiApShow(deps, auth.user, body)),
		),
	);

	app.post(
		'/fetch-external-resources',
		endpointHandler(deps, 'fetch-external-resources', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiFetchExternalResources(deps, auth.user, body)),
		),
	);
}
