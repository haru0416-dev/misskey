/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertTokenPermission, authenticateApiToken } from '../auth/auth.js';
import { rolePermissionDeniedError } from '../error.js';
import {
	handleApiHashtagsList,
	handleApiHashtagsSearch,
	handleApiHashtagsShow,
	handleApiHashtagsTrend,
	handleApiHashtagsUsers,
} from '../hashtag/hashtags.js';
import {
	handleApiInviteCreate,
	handleApiInviteDelete,
	handleApiInviteLimit,
	handleApiInviteList,
} from '../invite/invite.js';
import {
	handleApiNotificationsCreate,
	handleApiNotificationsDelete,
	handleApiNotificationsFlush,
	handleApiNotificationsMarkAllAsRead,
	handleApiNotificationsTestNotification,
} from '../notification/notification.js';
import { assertApiRateLimitForUser } from '../rate-limit.js';
import { getApiRolePolicies } from '../role/role-policy.js';
import {
	jsonResponse,
	emptyResponse,
	jsonBody,
	tokenFromRequest,
	runApiEndpoint,
	authenticateOptionalRequest,
} from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandler, endpointHandlerAnonymous } from '../endpoint-handlers.js';

export function registerHashtagsInviteNotificationsRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.on(
		['POST', 'QUERY'],
		'/hashtags/list',
		endpointHandlerAnonymous(deps, 'hashtags/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiHashtagsList(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/hashtags/search',
		endpointHandlerAnonymous(deps, 'hashtags/search', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiHashtagsSearch(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/hashtags/show',
		endpointHandlerAnonymous(deps, 'hashtags/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiHashtagsShow(deps, body)),
		),
	);

	app.get(
		'/hashtags/trend',
		endpointHandlerAnonymous(deps, 'hashtags/trend', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiHashtagsTrend(deps, c.req.query()), 200, {
				'Cache-Control': 'public, max-age=60',
			}),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/hashtags/trend',
		endpointHandlerAnonymous(deps, 'hashtags/trend', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiHashtagsTrend(deps, body), 200, {
				'Cache-Control': 'public, max-age=60',
			}),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/hashtags/users',
		endpointHandlerAnonymous(deps, 'hashtags/users', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiHashtagsUsers(deps, auth.user, body)),
		),
	);

	app.post('/invite/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:invite-codes');
			const policies = await getApiRolePolicies(deps, auth.user);
			if (!policies.canInvite && deps.meta.rootUserId !== auth.user.id) {
				throw rolePermissionDeniedError();
			}

			return jsonResponse(c, await handleApiInviteCreate(deps, auth.user, policies, body));
		});
	});

	app.post(
		'/invite/delete',
		endpointHandler(deps, 'invite/delete', async ({ body, auth, c }) => {
			await handleApiInviteDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(['POST', 'QUERY'], '/invite/limit', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:invite-codes');
			const policies = await getApiRolePolicies(deps, auth.user);
			if (!policies.canInvite && deps.meta.rootUserId !== auth.user.id) {
				throw rolePermissionDeniedError();
			}

			return jsonResponse(c, await handleApiInviteLimit(deps, auth.user, policies, body));
		});
	});

	app.on(
		['POST', 'QUERY'],
		'/invite/list',
		endpointHandler(deps, 'invite/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiInviteList(deps, auth.user, body)),
		),
	);

	app.post(
		'/notifications/create',
		endpointHandler(deps, 'notifications/create', async ({ body, auth, c }) => {
			await handleApiNotificationsCreate(deps, auth.user, auth.token, body);
			return emptyResponse(c);
		}),
	);

	app.post('/notifications/flush', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:notifications');

			handleApiNotificationsFlush(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post(
		'/notifications/delete',
		endpointHandler(deps, 'notifications/delete', async ({ body, auth, c }) => {
			await handleApiNotificationsDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post('/notifications/mark-all-as-read', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:notifications');

			handleApiNotificationsMarkAllAsRead(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/notifications/test-notification', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:notifications');
			await assertApiRateLimitForUser(
				deps,
				'notifications/test-notification',
				{
					duration: 1000 * 60,
					max: 10,
				},
				auth.user,
			);

			handleApiNotificationsTestNotification(deps, auth.user);
			return emptyResponse(c);
		});
	});
}
