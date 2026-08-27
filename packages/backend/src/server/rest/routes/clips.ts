/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertProhibitMoved, assertTokenPermission, authenticateApiToken } from '../auth/auth.js';
import { handleApiClipsFavorite, handleApiClipsUnfavorite } from '../favorite/favorites.js';
import {
	handleApiClipsAddNote,
	handleApiClipsCreate,
	handleApiClipsDelete,
	handleApiClipsList,
	handleApiClipsMyFavorites,
	handleApiClipsNotes,
	handleApiClipsRemoveNote,
	handleApiClipsShow,
	handleApiClipsUpdate,
} from '../clip/clips.js';
import { assertApiRateLimitForUser } from '../rate-limit.js';
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

export function registerClipsRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post(
		'/clips/favorite',
		endpointHandler(deps, 'clips/favorite', async ({ body, auth, c }) => {
			await handleApiClipsFavorite(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/clips/unfavorite',
		endpointHandler(deps, 'clips/unfavorite', async ({ body, auth, c }) => {
			await handleApiClipsUnfavorite(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/clips/list',
		endpointHandler(deps, 'clips/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiClipsList(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/clips/show',
		endpointHandlerAnonymous(deps, 'clips/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiClipsShow(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/clips/my-favorites',
		endpointHandler(deps, 'clips/my-favorites', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiClipsMyFavorites(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/clips/notes',
		endpointHandlerAnonymous(deps, 'clips/notes', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiClipsNotes(deps, auth.user, body)),
		),
	);

	app.post(
		'/clips/create',
		endpointHandler(deps, 'clips/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiClipsCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/clips/update',
		endpointHandler(deps, 'clips/update', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiClipsUpdate(deps, auth.user, body)),
		),
	);

	app.post(
		'/clips/delete',
		endpointHandler(deps, 'clips/delete', async ({ body, auth, c }) => {
			await handleApiClipsDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/clips/add-note',
		endpointHandler(deps, 'clips/add-note', async ({ body, auth, c }) => {
			await handleApiClipsAddNote(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/clips/remove-note',
		endpointHandler(deps, 'clips/remove-note', async ({ body, auth, c }) => {
			await handleApiClipsRemoveNote(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);
}
