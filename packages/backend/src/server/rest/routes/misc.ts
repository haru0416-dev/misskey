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
import { handleApiGetAvatarDecorations } from '../avatar-decoration/avatar-decorations.js';
import { handleApiGetOnlineUsersCount } from '../auth/availability.js';
import { handleApiPagesLike, handleApiPagesUnlike } from '../favorite/favorites.js';
import { handleApiMeta, handleApiPing, handleApiServerInfo, handleApiTest } from '../meta/meta.js';
import {
	handleApiPagesCreate,
	handleApiPagesDelete,
	handleApiPagesFeatured,
	handleApiPagesShow,
	handleApiPagesUpdate,
} from '../page/pages.js';
import { handleApiRequestResetPassword, handleApiResetPassword } from '../auth/password-reset.js';
import { handleApiPromoRead } from '../note/promo.js';
import { assertApiRateLimitForUser } from '../rate-limit.js';
import { handleApiResetDb } from '../admin/reset-db.js';
import { handleApiRetention } from '../retention/retention.js';
import { handleApiRolesList, handleApiRolesNotes, handleApiRolesShow, handleApiRolesUsers } from '../role/roles.js';
import {
	handleApiSwRegister,
	handleApiSwShowRegistration,
	handleApiSwUnregister,
	handleApiSwUpdateRegistration,
} from '../notification/sw.js';
import {
	jsonResponse,
	emptyResponse,
	jsonBody,
	tokenFromRequest,
	getRequestIp,
	runApiEndpoint,
	authenticateOptionalRequest,
} from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandler, endpointHandlerAnonymous } from '../endpoint-handlers.js';

export function registerMiscRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post(
		'/meta',
		endpointHandlerAnonymous(deps, 'meta', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiMeta(deps, body)),
		),
	);

	app.post(
		'/pages/create',
		endpointHandler(deps, 'pages/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiPagesCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/pages/update',
		endpointHandler(deps, 'pages/update', async ({ body, auth, c }) => {
			await handleApiPagesUpdate(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/pages/delete',
		endpointHandler(deps, 'pages/delete', async ({ body, auth, c }) => {
			await handleApiPagesDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/pages/show',
		endpointHandlerAnonymous(deps, 'pages/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiPagesShow(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/pages/featured',
		endpointHandlerAnonymous(deps, 'pages/featured', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiPagesFeatured(deps, auth.user, body)),
		),
	);

	app.post(
		'/pages/like',
		endpointHandler(deps, 'pages/like', async ({ body, auth, c }) => {
			await handleApiPagesLike(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/pages/unlike',
		endpointHandler(deps, 'pages/unlike', async ({ body, auth, c }) => {
			await handleApiPagesUnlike(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post('/ping', async (c) => {
		return await runApiEndpoint(c, async () => {
			await jsonBody(c);
			return jsonResponse(c, handleApiPing());
		});
	});

	app.post(
		'/promo/read',
		endpointHandler(deps, 'promo/read', async ({ body, auth, c }) => {
			await handleApiPromoRead(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.get(
		'/retention',
		endpointHandlerAnonymous(deps, 'retention', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiRetention(deps, {}), 200, {
				'Cache-Control': 'public, max-age=3600',
			}),
		),
	);

	app.post(
		'/retention',
		endpointHandlerAnonymous(deps, 'retention', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiRetention(deps, body), 200, {
				'Cache-Control': 'public, max-age=3600',
			}),
		),
	);

	app.post(
		'/request-reset-password',
		endpointHandlerAnonymous(deps, 'request-reset-password', async ({ body, auth, c }) => {
			await handleApiRequestResetPassword(deps, body, getRequestIp(c, deps.config));
			return emptyResponse(c);
		}),
	);

	app.post(
		'/reset-password',
		endpointHandlerAnonymous(deps, 'reset-password', async ({ body, auth, c }) => {
			await handleApiResetPassword(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/reset-db',
		endpointHandlerAnonymous(deps, 'reset-db', async ({ body, auth, c }) => {
			await handleApiResetDb(deps, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/roles/list',
		endpointHandler(deps, 'roles/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiRolesList(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/roles/show',
		endpointHandlerAnonymous(deps, 'roles/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiRolesShow(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/roles/users',
		endpointHandlerAnonymous(deps, 'roles/users', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiRolesUsers(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/roles/notes',
		endpointHandler(deps, 'roles/notes', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiRolesNotes(deps, auth.user, body)),
		),
	);

	app.get(
		'/server-info',
		endpointHandlerAnonymous(deps, 'server-info', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiServerInfo(deps.meta), 200, {
				'Cache-Control': 'public, max-age=60',
			}),
		),
	);

	app.post(
		'/server-info',
		endpointHandlerAnonymous(deps, 'server-info', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiServerInfo(deps.meta), 200, {
				'Cache-Control': 'public, max-age=60',
			}),
		),
	);

	app.post(
		'/sw/register',
		endpointHandler(deps, 'sw/register', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiSwRegister(deps, auth.user, body)),
		),
	);

	app.post(
		'/sw/show-registration',
		endpointHandler(deps, 'sw/show-registration', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiSwShowRegistration(deps, auth.user, body)),
		),
	);

	app.post(
		'/sw/unregister',
		endpointHandlerAnonymous(deps, 'sw/unregister', async ({ body, auth, c }) => {
			await handleApiSwUnregister(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/sw/update-registration',
		endpointHandler(deps, 'sw/update-registration', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiSwUpdateRegistration(deps, auth.user, body)),
		),
	);

	app.post('/test', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, handleApiTest(body));
		});
	});

	app.get(
		'/get-online-users-count',
		endpointHandlerAnonymous(deps, 'get-online-users-count', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiGetOnlineUsersCount(deps), 200, {
				'Cache-Control': 'public, max-age=60',
			}),
		),
	);

	app.post(
		'/get-online-users-count',
		endpointHandlerAnonymous(deps, 'get-online-users-count', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiGetOnlineUsersCount(deps), 200, {
				'Cache-Control': 'public, max-age=60',
			}),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/get-avatar-decorations',
		endpointHandlerAnonymous(deps, 'get-avatar-decorations', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiGetAvatarDecorations(deps, body)),
		),
	);
}
