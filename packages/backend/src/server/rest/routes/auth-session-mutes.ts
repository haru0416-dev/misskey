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
} from '../auth/auth.js';
import {
	handleHonoApiAuthAccept,
	handleHonoApiAuthSessionGenerate,
	handleHonoApiAuthSessionShow,
	handleHonoApiAuthSessionUserkey,
} from '../auth/auth-session.js';
import {
	handleHonoApiBlockingCreate,
	handleHonoApiBlockingDelete,
	handleHonoApiBlockingList,
} from '../account/account-blocking.js';
import {
	handleHonoApiMuteCreate,
	handleHonoApiMuteDelete,
	handleHonoApiMuteList,
	handleHonoApiRenoteMuteCreate,
	handleHonoApiRenoteMuteDelete,
	handleHonoApiRenoteMuteList,
} from '../account/account-mutes.js';
import { assertHonoApiRateLimitForUser } from '../rate-limit.js';
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

export function registerAuthSessionMutesRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post(
		'/auth/session/generate',
		endpointHandlerAnonymous(deps, 'auth/session/generate', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAuthSessionGenerate(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/auth/session/show',
		endpointHandlerAnonymous(deps, 'auth/session/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAuthSessionShow(deps, auth.user, body)),
		),
	);

	app.post(
		'/auth/session/userkey',
		endpointHandlerAnonymous(deps, 'auth/session/userkey', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAuthSessionUserkey(deps, body)),
		),
	);

	app.post(
		'/auth/accept',
		endpointHandler(deps, 'auth/accept', async ({ body, auth, c }) => {
			await handleHonoApiAuthAccept(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/blocking/create',
		endpointHandler(deps, 'blocking/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiBlockingCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/blocking/delete',
		endpointHandler(deps, 'blocking/delete', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiBlockingDelete(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/blocking/list',
		endpointHandler(deps, 'blocking/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiBlockingList(deps, auth.user, body)),
		),
	);

	app.post(
		'/mute/create',
		endpointHandler(deps, 'mute/create', async ({ body, auth, c }) => {
			await handleHonoApiMuteCreate(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/mute/delete',
		endpointHandler(deps, 'mute/delete', async ({ body, auth, c }) => {
			await handleHonoApiMuteDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/mute/list',
		endpointHandler(deps, 'mute/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiMuteList(deps, auth.user, body)),
		),
	);

	app.post(
		'/renote-mute/create',
		endpointHandler(deps, 'renote-mute/create', async ({ body, auth, c }) => {
			await handleHonoApiRenoteMuteCreate(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/renote-mute/delete',
		endpointHandler(deps, 'renote-mute/delete', async ({ body, auth, c }) => {
			await handleHonoApiRenoteMuteDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/renote-mute/list',
		endpointHandler(deps, 'renote-mute/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiRenoteMuteList(deps, auth.user, body)),
		),
	);
}
