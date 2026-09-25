/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import {
	handleApiBlockingCreate,
	handleApiBlockingDelete,
	handleApiBlockingList,
} from '../account/account-blocking.js';
import {
	handleApiMuteCreate,
	handleApiMuteDelete,
	handleApiMuteList,
	handleApiRenoteMuteCreate,
	handleApiRenoteMuteDelete,
	handleApiRenoteMuteList,
} from '../account/account-mutes.js';
import { jsonResponse, emptyResponse } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandler } from '../endpoint-handlers.js';

export function registerAuthSessionMutesRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post(
		'/blocking/create',
		endpointHandler(deps, 'blocking/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiBlockingCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/blocking/delete',
		endpointHandler(deps, 'blocking/delete', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiBlockingDelete(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/blocking/list',
		endpointHandler(deps, 'blocking/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiBlockingList(deps, auth.user, body)),
		),
	);

	app.post(
		'/mute/create',
		endpointHandler(deps, 'mute/create', async ({ body, auth, c }) => {
			await handleApiMuteCreate(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/mute/delete',
		endpointHandler(deps, 'mute/delete', async ({ body, auth, c }) => {
			await handleApiMuteDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/mute/list',
		endpointHandler(deps, 'mute/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiMuteList(deps, auth.user, body)),
		),
	);

	app.post(
		'/renote-mute/create',
		endpointHandler(deps, 'renote-mute/create', async ({ body, auth, c }) => {
			await handleApiRenoteMuteCreate(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/renote-mute/delete',
		endpointHandler(deps, 'renote-mute/delete', async ({ body, auth, c }) => {
			await handleApiRenoteMuteDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/renote-mute/list',
		endpointHandler(deps, 'renote-mute/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiRenoteMuteList(deps, auth.user, body)),
		),
	);
}
