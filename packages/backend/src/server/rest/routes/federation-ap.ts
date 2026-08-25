/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertSecureCredential, assertTokenPermission, authenticateHonoApiToken } from '../auth.js';
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
} from '../federation.js';
import { handleHonoApiFetchExternalResources } from '../fetch-external-resources.js';
import { handleHonoApiApGet, handleHonoApiApShow } from '../ap.js';
import { handleHonoApiFederationUpdateRemoteUser } from '../ap-person.js';
import { assertHonoApiRateLimitForUser } from '../rate-limit.js';
import { isHonoApiAdministrator } from '../role-policy.js';
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

export function registerFederationApRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post('/endpoints', async (c) => {
		return await runApiEndpoint(c, async () => {
			return jsonResponse(c, await handleHonoApiEndpoints());
		});
	});

	app.post('/endpoint', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiEndpoint(body));
		});
	});

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

	app.on(['POST', 'QUERY'], '/federation/show-instance', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiFederationShowInstance(deps, auth.user, body));
		});
	});

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

	app.on(['POST', 'QUERY'], '/federation/users', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiFederationUsers(deps, auth.user, body));
		});
	});

	app.on(['POST', 'QUERY'], '/federation/followers', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiFederationFollowers(deps, body));
		});
	});

	app.on(['POST', 'QUERY'], '/federation/following', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiFederationFollowing(deps, body));
		});
	});

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

	app.post('/federation/update-remote-user', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			await handleHonoApiFederationUpdateRemoteUser(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/ap/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');
			await assertHonoApiRateLimitForUser(
				deps,
				'ap/show',
				{
					duration: 60 * 60 * 1000,
					max: 30,
				},
				auth.user,
			);

			return jsonResponse(c, await handleHonoApiApShow(deps, auth.user, body));
		});
	});

	app.post('/fetch-external-resources', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			return jsonResponse(c, await handleHonoApiFetchExternalResources(deps, auth.user, body));
		});
	});
}
