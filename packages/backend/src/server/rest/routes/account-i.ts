/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import {
	assertCredential,
	assertProhibitMoved,
	assertSecureCredential,
	assertTokenPermission,
	authenticateHonoApiToken,
} from '../auth.js';
import { handleHonoApiIAuthorizedApps, handleHonoApiIApps, handleHonoApiIRevokeToken } from '../app.js';
import { handleHonoApiIFavorites } from '../favorites.js';
import {
	handleHonoApiIChangePassword,
	handleHonoApiIDeleteAccount,
	handleHonoApiIRegenerateToken,
	handleHonoApiIUpdateEmail,
} from '../account-security.js';
import { handleHonoApiIUpdate } from '../account-update.js';
import { handleHonoApiIMove } from '../account-move.js';
import { handleHonoApiIPin, handleHonoApiIUnpin } from '../account-pin.js';
import { handleHonoApiINotifications, handleHonoApiINotificationsGrouped } from '../notifications-list.js';
import { handleHonoApiI, handleHonoApiISigninHistory } from '../i.js';
import {
	handleHonoApiI2faDone,
	handleHonoApiI2faKeyDone,
	handleHonoApiI2faPasswordLess,
	handleHonoApiI2faRegister,
	handleHonoApiI2faRegisterKey,
	handleHonoApiI2faRemoveKey,
	handleHonoApiI2faUnregister,
	handleHonoApiI2faUpdateKey,
} from '../i-2fa.js';
import { handleHonoApiIPageLikes, handleHonoApiIPages } from '../pages.js';
import { assertHonoApiRateLimitForUser } from '../rate-limit.js';
import { getHonoApiRolePolicies } from '../role-policy.js';
import {
	handleHonoApiRegistryGet,
	handleHonoApiRegistryGetAll,
	handleHonoApiRegistryGetDetail,
	handleHonoApiRegistryKeys,
	handleHonoApiRegistryKeysWithType,
	handleHonoApiRegistryRemove,
	handleHonoApiRegistryScopesWithDomain,
	handleHonoApiRegistrySet,
} from '../registry.js';
import {
	handleHonoApiIWebhooksCreate,
	handleHonoApiIWebhooksDelete,
	handleHonoApiIWebhooksList,
	handleHonoApiIWebhooksShow,
	handleHonoApiIWebhooksTest,
	handleHonoApiIWebhooksUpdate,
} from '../webhooks.js';
import { jsonResponse, emptyResponse, jsonBody, tokenFromRequest, runApiEndpoint } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandler } from '../endpoint-handlers.js';

export function registerAccountIRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post(
		'/i',
		endpointHandler(deps, 'i', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiI(deps, auth.user, auth.token)),
		),
	);

	app.post('/i/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');
			await assertHonoApiRateLimitForUser(
				deps,
				'i/update',
				{
					duration: 60 * 60 * 1000,
					max: 20,
				},
				auth.user,
			);

			return jsonResponse(c, await handleHonoApiIUpdate(deps, auth.user, auth.token, body));
		});
	});

	app.post('/i/move', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			assertProhibitMoved(auth.user);
			await assertHonoApiRateLimitForUser(
				deps,
				'i/move',
				{
					duration: 24 * 60 * 60 * 1000,
					max: 5,
				},
				auth.user,
			);

			return jsonResponse(c, await handleHonoApiIMove(deps, auth.user, body));
		});
	});

	app.post(
		'/i/pin',
		endpointHandler(deps, 'i/pin', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiIPin(deps, auth.user, body)),
		),
	);

	app.post(
		'/i/unpin',
		endpointHandler(deps, 'i/unpin', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiIUnpin(deps, auth.user, body)),
		),
	);

	app.on(['POST', 'QUERY'], '/i/notifications', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:notifications');
			await assertHonoApiRateLimitForUser(
				deps,
				'i/notifications',
				{
					duration: 30000,
					max: 30,
				},
				auth.user,
			);

			return jsonResponse(c, await handleHonoApiINotifications(deps, auth.user, body));
		});
	});

	app.on(['POST', 'QUERY'], '/i/notifications-grouped', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:notifications');
			await assertHonoApiRateLimitForUser(
				deps,
				'i/notifications-grouped',
				{
					duration: 30000,
					max: 30,
				},
				auth.user,
			);

			return jsonResponse(c, await handleHonoApiINotificationsGrouped(deps, auth.user, body));
		});
	});

	app.on(
		['POST', 'QUERY'],
		'/i/favorites',
		endpointHandler(deps, 'i/favorites', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiIFavorites(deps, auth.user, body)),
		),
	);

	app.post('/i/change-password', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			await handleHonoApiIChangePassword(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/i/regenerate-token', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			await handleHonoApiIRegenerateToken(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/i/delete-account', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			await handleHonoApiIDeleteAccount(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/i/update-email', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiRateLimitForUser(
				deps,
				'i/update-email',
				{
					duration: 60 * 60 * 1000,
					max: 3,
				},
				auth.user,
			);

			return jsonResponse(c, await handleHonoApiIUpdateEmail(deps, auth.user, body));
		});
	});

	app.post(
		'/i/2fa/register',
		endpointHandler(deps, 'i/2fa/register', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiI2faRegister(deps, auth.user, body)),
		),
	);

	app.post(
		'/i/2fa/done',
		endpointHandler(deps, 'i/2fa/done', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiI2faDone(deps, auth.user, body)),
		),
	);

	app.post(
		'/i/2fa/register-key',
		endpointHandler(deps, 'i/2fa/register-key', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiI2faRegisterKey(deps, auth.user, body)),
		),
	);

	app.post(
		'/i/2fa/key-done',
		endpointHandler(deps, 'i/2fa/key-done', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiI2faKeyDone(deps, auth.user, body)),
		),
	);

	app.post(
		'/i/2fa/update-key',
		endpointHandler(deps, 'i/2fa/update-key', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiI2faUpdateKey(deps, auth.user, body)),
		),
	);

	app.post(
		'/i/2fa/remove-key',
		endpointHandler(deps, 'i/2fa/remove-key', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiI2faRemoveKey(deps, auth.user, body)),
		),
	);

	app.post('/i/2fa/unregister', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			await handleHonoApiI2faUnregister(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/i/2fa/password-less', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			await handleHonoApiI2faPasswordLess(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.on(
		['POST', 'QUERY'],
		'/i/apps',
		endpointHandler(deps, 'i/apps', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiIApps(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/authorized-apps',
		endpointHandler(deps, 'i/authorized-apps', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiIAuthorizedApps(deps, auth.user, body)),
		),
	);

	app.post('/i/revoke-token', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			await handleHonoApiIRevokeToken(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.on(
		['POST', 'QUERY'],
		'/i/registry/get',
		endpointHandler(deps, 'i/registry/get', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiRegistryGet(deps, auth.user, auth.token, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/registry/get-all',
		endpointHandler(deps, 'i/registry/get-all', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiRegistryGetAll(deps, auth.user, auth.token, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/registry/get-detail',
		endpointHandler(deps, 'i/registry/get-detail', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiRegistryGetDetail(deps, auth.user, auth.token, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/registry/keys',
		endpointHandler(deps, 'i/registry/keys', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiRegistryKeys(deps, auth.user, auth.token, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/registry/keys-with-type',
		endpointHandler(deps, 'i/registry/keys-with-type', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiRegistryKeysWithType(deps, auth.user, auth.token, body)),
		),
	);

	app.post('/i/registry/remove', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiRegistryRemove(deps, auth.user, auth.token, body);
			return emptyResponse(c);
		});
	});

	app.on(
		['POST', 'QUERY'],
		'/i/registry/scopes-with-domain',
		endpointHandler(deps, 'i/registry/scopes-with-domain', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiRegistryScopesWithDomain(deps, auth.user, body)),
		),
	);

	app.post('/i/registry/set', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiRegistrySet(deps, auth.user, auth.token, body);
			return emptyResponse(c);
		});
	});

	app.on(
		['POST', 'QUERY'],
		'/i/pages',
		endpointHandler(deps, 'i/pages', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiIPages(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/page-likes',
		endpointHandler(deps, 'i/page-likes', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiIPageLikes(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/signin-history',
		endpointHandler(deps, 'i/signin-history', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiISigninHistory(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/webhooks/list',
		endpointHandler(deps, 'i/webhooks/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiIWebhooksList(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/webhooks/show',
		endpointHandler(deps, 'i/webhooks/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiIWebhooksShow(deps, auth.user, body)),
		),
	);

	app.post('/i/webhooks/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiIWebhooksDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/i/webhooks/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiIWebhooksUpdate(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/i/webhooks/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');
			const policies = await getHonoApiRolePolicies(deps, auth.user);

			return jsonResponse(c, await handleHonoApiIWebhooksCreate(deps, auth.user, policies.webhookLimit, body));
		});
	});

	app.post('/i/webhooks/test', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			assertTokenPermission(auth, 'read:account');
			await assertHonoApiRateLimitForUser(
				deps,
				'i/webhooks/test',
				{
					duration: 15 * 60 * 1000,
					max: 60,
				},
				auth.user,
			);

			await handleHonoApiIWebhooksTest(deps, auth.user, body);
			return emptyResponse(c);
		});
	});
}
