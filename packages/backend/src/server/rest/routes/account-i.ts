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
	authenticateApiToken,
} from '../auth/auth.js';
import { handleApiIAuthorizedApps, handleApiIApps, handleApiIRevokeToken } from '../auth/app.js';
import { handleApiIFavorites } from '../favorite/favorites.js';
import {
	handleApiIChangePassword,
	handleApiIDeleteAccount,
	handleApiIRegenerateToken,
	handleApiIUpdateEmail,
} from '../account/account-security.js';
import { handleApiIUpdate } from '../account/account-update.js';
import { handleApiIMove } from '../account/account-move.js';
import { handleApiIPin, handleApiIUnpin } from '../account/account-pin.js';
import { handleApiINotifications, handleApiINotificationsGrouped } from '../notification/notifications-list.js';
import { handleApiI, handleApiISigninHistory } from '../account/i.js';
import {
	handleApiI2faDone,
	handleApiI2faKeyDone,
	handleApiI2faPasswordLess,
	handleApiI2faRegister,
	handleApiI2faRegisterKey,
	handleApiI2faRemoveKey,
	handleApiI2faUnregister,
	handleApiI2faUpdateKey,
} from '../account/i-2fa.js';
import { handleApiIPageLikes, handleApiIPages } from '../page/pages.js';
import { assertApiRateLimitForUser } from '../rate-limit.js';
import { getApiRolePolicies } from '../role/role-policy.js';
import {
	handleApiRegistryGet,
	handleApiRegistryGetAll,
	handleApiRegistryGetDetail,
	handleApiRegistryKeys,
	handleApiRegistryKeysWithType,
	handleApiRegistryRemove,
	handleApiRegistryScopesWithDomain,
	handleApiRegistrySet,
} from '../registry/registry.js';
import {
	handleApiIWebhooksCreate,
	handleApiIWebhooksDelete,
	handleApiIWebhooksList,
	handleApiIWebhooksShow,
	handleApiIWebhooksTest,
	handleApiIWebhooksUpdate,
} from '../webhook/webhooks.js';
import { jsonResponse, emptyResponse, jsonBody, tokenFromRequest, runApiEndpoint } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandler } from '../endpoint-handlers.js';

export function registerAccountIRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post(
		'/i',
		endpointHandler(deps, 'i', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiI(deps, auth.user, auth.token)),
		),
	);

	app.post(
		'/i/update',
		endpointHandler(deps, 'i/update', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiIUpdate(deps, auth.user, auth.token, body)),
		),
	);

	app.post(
		'/i/move',
		endpointHandler(deps, 'i/move', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiIMove(deps, auth.user, body)),
		),
	);

	app.post(
		'/i/pin',
		endpointHandler(deps, 'i/pin', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiIPin(deps, auth.user, body)),
		),
	);

	app.post(
		'/i/unpin',
		endpointHandler(deps, 'i/unpin', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiIUnpin(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/notifications',
		endpointHandler(deps, 'i/notifications', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiINotifications(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/notifications-grouped',
		endpointHandler(deps, 'i/notifications-grouped', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiINotificationsGrouped(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/favorites',
		endpointHandler(deps, 'i/favorites', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiIFavorites(deps, auth.user, body)),
		),
	);

	app.post(
		'/i/change-password',
		endpointHandler(deps, 'i/change-password', async ({ body, auth, c }) => {
			await handleApiIChangePassword(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/i/regenerate-token',
		endpointHandler(deps, 'i/regenerate-token', async ({ body, auth, c }) => {
			await handleApiIRegenerateToken(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/i/delete-account',
		endpointHandler(deps, 'i/delete-account', async ({ body, auth, c }) => {
			await handleApiIDeleteAccount(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/i/update-email',
		endpointHandler(deps, 'i/update-email', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiIUpdateEmail(deps, auth.user, body)),
		),
	);

	app.post(
		'/i/2fa/register',
		endpointHandler(deps, 'i/2fa/register', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiI2faRegister(deps, auth.user, body)),
		),
	);

	app.post(
		'/i/2fa/done',
		endpointHandler(deps, 'i/2fa/done', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiI2faDone(deps, auth.user, body)),
		),
	);

	app.post(
		'/i/2fa/register-key',
		endpointHandler(deps, 'i/2fa/register-key', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiI2faRegisterKey(deps, auth.user, body)),
		),
	);

	app.post(
		'/i/2fa/key-done',
		endpointHandler(deps, 'i/2fa/key-done', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiI2faKeyDone(deps, auth.user, body)),
		),
	);

	app.post(
		'/i/2fa/update-key',
		endpointHandler(deps, 'i/2fa/update-key', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiI2faUpdateKey(deps, auth.user, body)),
		),
	);

	app.post(
		'/i/2fa/remove-key',
		endpointHandler(deps, 'i/2fa/remove-key', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiI2faRemoveKey(deps, auth.user, body)),
		),
	);

	app.post(
		'/i/2fa/unregister',
		endpointHandler(deps, 'i/2fa/unregister', async ({ body, auth, c }) => {
			await handleApiI2faUnregister(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/i/2fa/password-less',
		endpointHandler(deps, 'i/2fa/password-less', async ({ body, auth, c }) => {
			await handleApiI2faPasswordLess(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/apps',
		endpointHandler(deps, 'i/apps', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiIApps(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/authorized-apps',
		endpointHandler(deps, 'i/authorized-apps', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiIAuthorizedApps(deps, auth.user, body)),
		),
	);

	app.post(
		'/i/revoke-token',
		endpointHandler(deps, 'i/revoke-token', async ({ body, auth, c }) => {
			await handleApiIRevokeToken(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/registry/get',
		endpointHandler(deps, 'i/registry/get', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiRegistryGet(deps, auth.user, auth.token, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/registry/get-all',
		endpointHandler(deps, 'i/registry/get-all', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiRegistryGetAll(deps, auth.user, auth.token, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/registry/get-detail',
		endpointHandler(deps, 'i/registry/get-detail', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiRegistryGetDetail(deps, auth.user, auth.token, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/registry/keys',
		endpointHandler(deps, 'i/registry/keys', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiRegistryKeys(deps, auth.user, auth.token, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/registry/keys-with-type',
		endpointHandler(deps, 'i/registry/keys-with-type', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiRegistryKeysWithType(deps, auth.user, auth.token, body)),
		),
	);

	app.post(
		'/i/registry/remove',
		endpointHandler(deps, 'i/registry/remove', async ({ body, auth, c }) => {
			await handleApiRegistryRemove(deps, auth.user, auth.token, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/registry/scopes-with-domain',
		endpointHandler(deps, 'i/registry/scopes-with-domain', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiRegistryScopesWithDomain(deps, auth.user, body)),
		),
	);

	app.post(
		'/i/registry/set',
		endpointHandler(deps, 'i/registry/set', async ({ body, auth, c }) => {
			await handleApiRegistrySet(deps, auth.user, auth.token, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/pages',
		endpointHandler(deps, 'i/pages', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiIPages(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/page-likes',
		endpointHandler(deps, 'i/page-likes', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiIPageLikes(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/signin-history',
		endpointHandler(deps, 'i/signin-history', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiISigninHistory(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/webhooks/list',
		endpointHandler(deps, 'i/webhooks/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiIWebhooksList(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/webhooks/show',
		endpointHandler(deps, 'i/webhooks/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiIWebhooksShow(deps, auth.user, body)),
		),
	);

	app.post(
		'/i/webhooks/delete',
		endpointHandler(deps, 'i/webhooks/delete', async ({ body, auth, c }) => {
			await handleApiIWebhooksDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/i/webhooks/update',
		endpointHandler(deps, 'i/webhooks/update', async ({ body, auth, c }) => {
			await handleApiIWebhooksUpdate(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post('/i/webhooks/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');
			const policies = await getApiRolePolicies(deps, auth.user);

			return jsonResponse(c, await handleApiIWebhooksCreate(deps, auth.user, policies.webhookLimit, body));
		});
	});

	app.post(
		'/i/webhooks/test',
		endpointHandler(deps, 'i/webhooks/test', async ({ body, auth, c }) => {
			await handleApiIWebhooksTest(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);
}
