/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertTokenPermission, authenticateHonoApiToken } from '../auth.js';
import { rolePermissionDeniedError } from '../error.js';
import {
	handleHonoApiHashtagsList,
	handleHonoApiHashtagsSearch,
	handleHonoApiHashtagsShow,
	handleHonoApiHashtagsTrend,
	handleHonoApiHashtagsUsers,
} from '../hashtags.js';
import {
	handleHonoApiInviteCreate,
	handleHonoApiInviteDelete,
	handleHonoApiInviteLimit,
	handleHonoApiInviteList,
} from '../invite.js';
import {
	handleHonoApiNotificationsCreate,
	handleHonoApiNotificationsDelete,
	handleHonoApiNotificationsFlush,
	handleHonoApiNotificationsMarkAllAsRead,
	handleHonoApiNotificationsTestNotification,
} from '../notification.js';
import { assertHonoApiRateLimitForUser } from '../rate-limit.js';
import { getHonoApiRolePolicies } from '../role-policy.js';
import {
	jsonResponse,
	emptyResponse,
	jsonBody,
	tokenFromRequest,
	runApiEndpoint,
	authenticateOptionalRequest,
} from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';

export function registerHashtagsInviteNotificationsRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post('/hashtags/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiHashtagsList(deps, body));
		});
	});

	app.post('/hashtags/search', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiHashtagsSearch(deps, body));
		});
	});

	app.post('/hashtags/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiHashtagsShow(deps, body));
		});
	});

	app.get('/hashtags/trend', async (c) => {
		return await runApiEndpoint(c, async () => {
			return jsonResponse(c, await handleHonoApiHashtagsTrend(deps, c.req.query()), 200, {
				'Cache-Control': 'public, max-age=60',
			});
		});
	});

	app.post('/hashtags/trend', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiHashtagsTrend(deps, body));
		});
	});

	app.post('/hashtags/users', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiHashtagsUsers(deps, auth.user, body));
		});
	});

	app.post('/invite/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:invite-codes');
			const policies = await getHonoApiRolePolicies(deps, auth.user);
			if (!policies.canInvite && deps.meta.rootUserId !== auth.user.id) {
				throw rolePermissionDeniedError();
			}

			return jsonResponse(c, await handleHonoApiInviteCreate(deps, auth.user, policies, body));
		});
	});

	app.post('/invite/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:invite-codes');
			const policies = await getHonoApiRolePolicies(deps, auth.user);
			if (!policies.canInvite && deps.meta.rootUserId !== auth.user.id) {
				throw rolePermissionDeniedError();
			}

			await handleHonoApiInviteDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/invite/limit', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:invite-codes');
			const policies = await getHonoApiRolePolicies(deps, auth.user);
			if (!policies.canInvite && deps.meta.rootUserId !== auth.user.id) {
				throw rolePermissionDeniedError();
			}

			return jsonResponse(c, await handleHonoApiInviteLimit(deps, auth.user, policies, body));
		});
	});

	app.post('/invite/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:invite-codes');
			const policies = await getHonoApiRolePolicies(deps, auth.user);
			if (!policies.canInvite && deps.meta.rootUserId !== auth.user.id) {
				throw rolePermissionDeniedError();
			}

			return jsonResponse(c, await handleHonoApiInviteList(deps, auth.user, body));
		});
	});

	app.post('/notifications/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:notifications');
			await assertHonoApiRateLimitForUser(
				deps,
				'notifications/create',
				{
					duration: 1000 * 60,
					max: 10,
				},
				auth.user,
			);

			await handleHonoApiNotificationsCreate(deps, auth.user, auth.token, body);
			return emptyResponse(c);
		});
	});

	app.post('/notifications/flush', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:notifications');

			handleHonoApiNotificationsFlush(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/notifications/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:notifications');

			await handleHonoApiNotificationsDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/notifications/mark-all-as-read', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:notifications');

			handleHonoApiNotificationsMarkAllAsRead(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/notifications/test-notification', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:notifications');
			await assertHonoApiRateLimitForUser(
				deps,
				'notifications/test-notification',
				{
					duration: 1000 * 60,
					max: 10,
				},
				auth.user,
			);

			handleHonoApiNotificationsTestNotification(deps, auth.user);
			return emptyResponse(c);
		});
	});
}
