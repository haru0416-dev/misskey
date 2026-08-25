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
import { handleHonoApiGetAvatarDecorations } from '../avatar-decorations.js';
import { handleHonoApiGetOnlineUsersCount } from '../availability.js';
import { handleHonoApiPagesLike, handleHonoApiPagesUnlike } from '../favorites.js';
import { handleHonoApiMeta, handleHonoApiPing, handleHonoApiServerInfo, handleHonoApiTest } from '../meta.js';
import {
	handleHonoApiPagesCreate,
	handleHonoApiPagesDelete,
	handleHonoApiPagesFeatured,
	handleHonoApiPagesShow,
	handleHonoApiPagesUpdate,
} from '../pages.js';
import { handleHonoApiRequestResetPassword, handleHonoApiResetPassword } from '../password-reset.js';
import { handleHonoApiPromoRead } from '../promo.js';
import { assertHonoApiRateLimitForUser } from '../rate-limit.js';
import { handleHonoApiResetDb } from '../reset-db.js';
import { handleHonoApiRetention } from '../retention.js';
import {
	handleHonoApiRolesList,
	handleHonoApiRolesNotes,
	handleHonoApiRolesShow,
	handleHonoApiRolesUsers,
} from '../roles.js';
import {
	handleHonoApiSwRegister,
	handleHonoApiSwShowRegistration,
	handleHonoApiSwUnregister,
	handleHonoApiSwUpdateRegistration,
} from '../sw.js';
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
		endpointHandler(deps, 'meta', async ({ body, auth, c }) => jsonResponse(c, await handleHonoApiMeta(deps, body))),
	);

	app.post(
		'/pages/create',
		endpointHandler(deps, 'pages/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiPagesCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/pages/update',
		endpointHandler(deps, 'pages/update', async ({ body, auth, c }) => {
			await handleHonoApiPagesUpdate(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/pages/delete',
		endpointHandler(deps, 'pages/delete', async ({ body, auth, c }) => {
			await handleHonoApiPagesDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/pages/show',
		endpointHandlerAnonymous(deps, 'pages/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiPagesShow(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/pages/featured',
		endpointHandlerAnonymous(deps, 'pages/featured', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiPagesFeatured(deps, auth.user, body)),
		),
	);

	app.post(
		'/pages/like',
		endpointHandler(deps, 'pages/like', async ({ body, auth, c }) => {
			await handleHonoApiPagesLike(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/pages/unlike',
		endpointHandler(deps, 'pages/unlike', async ({ body, auth, c }) => {
			await handleHonoApiPagesUnlike(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post('/ping', async (c) => {
		return await runApiEndpoint(c, async () => {
			await jsonBody(c);
			return jsonResponse(c, handleHonoApiPing());
		});
	});

	app.post(
		'/promo/read',
		endpointHandler(deps, 'promo/read', async ({ body, auth, c }) => {
			await handleHonoApiPromoRead(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.get(
		'/retention',
		endpointHandler(deps, 'retention', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiRetention(deps, {}), 200, {
				'Cache-Control': 'public, max-age=3600',
			}),
		),
	);

	app.post(
		'/retention',
		endpointHandler(deps, 'retention', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiRetention(deps, body), 200, {
				'Cache-Control': 'public, max-age=3600',
			}),
		),
	);

	app.post(
		'/request-reset-password',
		endpointHandler(deps, 'request-reset-password', async ({ body, auth, c }) => {
			await handleHonoApiRequestResetPassword(deps, body, getRequestIp(c, deps.config));
			return emptyResponse(c);
		}),
	);

	app.post(
		'/reset-password',
		endpointHandler(deps, 'reset-password', async ({ body, auth, c }) => {
			await handleHonoApiResetPassword(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/reset-db',
		endpointHandler(deps, 'reset-db', async ({ body, auth, c }) => {
			await handleHonoApiResetDb(deps, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/roles/list',
		endpointHandler(deps, 'roles/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiRolesList(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/roles/show',
		endpointHandler(deps, 'roles/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiRolesShow(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/roles/users',
		endpointHandlerAnonymous(deps, 'roles/users', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiRolesUsers(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/roles/notes',
		endpointHandler(deps, 'roles/notes', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiRolesNotes(deps, auth.user, body)),
		),
	);

	app.get(
		'/server-info',
		endpointHandler(deps, 'server-info', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiServerInfo(deps.meta), 200, {
				'Cache-Control': 'public, max-age=60',
			}),
		),
	);

	app.post(
		'/server-info',
		endpointHandler(deps, 'server-info', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiServerInfo(deps.meta), 200, {
				'Cache-Control': 'public, max-age=60',
			}),
		),
	);

	app.post(
		'/sw/register',
		endpointHandler(deps, 'sw/register', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiSwRegister(deps, auth.user, body)),
		),
	);

	app.post(
		'/sw/show-registration',
		endpointHandler(deps, 'sw/show-registration', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiSwShowRegistration(deps, auth.user, body)),
		),
	);

	app.post(
		'/sw/unregister',
		endpointHandlerAnonymous(deps, 'sw/unregister', async ({ body, auth, c }) => {
			await handleHonoApiSwUnregister(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/sw/update-registration',
		endpointHandler(deps, 'sw/update-registration', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiSwUpdateRegistration(deps, auth.user, body)),
		),
	);

	app.post('/test', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, handleHonoApiTest(body));
		});
	});

	app.get(
		'/get-online-users-count',
		endpointHandler(deps, 'get-online-users-count', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiGetOnlineUsersCount(deps), 200, {
				'Cache-Control': 'public, max-age=60',
			}),
		),
	);

	app.post(
		'/get-online-users-count',
		endpointHandler(deps, 'get-online-users-count', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiGetOnlineUsersCount(deps), 200, {
				'Cache-Control': 'public, max-age=60',
			}),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/get-avatar-decorations',
		endpointHandler(deps, 'get-avatar-decorations', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiGetAvatarDecorations(deps, body)),
		),
	);
}
