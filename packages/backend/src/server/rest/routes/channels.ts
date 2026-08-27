/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertProhibitMoved, assertTokenPermission, authenticateApiToken } from '../auth/auth.js';
import { rolePermissionDeniedError } from '../error.js';
import { handleApiChannelsFavorite, handleApiChannelsUnfavorite } from '../favorite/favorites.js';
import {
	handleApiChannelsCreate,
	handleApiChannelsFeatured,
	handleApiChannelsFollow,
	handleApiChannelsFollowed,
	handleApiChannelsMuteCreate,
	handleApiChannelsMuteDelete,
	handleApiChannelsMuteList,
	handleApiChannelsMyFavorites,
	handleApiChannelsOwned,
	handleApiChannelsSearch,
	handleApiChannelsShow,
	handleApiChannelsTimeline,
	handleApiChannelsUnfollow,
	handleApiChannelsUpdate,
} from '../channel/channels.js';
import { assertApiRateLimitForUser } from '../rate-limit.js';
import { hasApiRolePolicyOrIsRoot } from '../role/role-policy.js';
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

export function registerChannelsRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post(
		'/channels/favorite',
		endpointHandler(deps, 'channels/favorite', async ({ body, auth, c }) => {
			await handleApiChannelsFavorite(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/channels/create',
		endpointHandler(deps, 'channels/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChannelsCreate(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/channels/featured',
		endpointHandlerAnonymous(deps, 'channels/featured', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChannelsFeatured(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/channels/show',
		endpointHandlerAnonymous(deps, 'channels/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChannelsShow(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/channels/timeline',
		endpointHandlerAnonymous(deps, 'channels/timeline', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChannelsTimeline(deps, auth.user, body)),
		),
	);

	app.post(
		'/channels/follow',
		endpointHandler(deps, 'channels/follow', async ({ body, auth, c }) => {
			await handleApiChannelsFollow(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/channels/followed',
		endpointHandler(deps, 'channels/followed', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChannelsFollowed(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/channels/my-favorites',
		endpointHandler(deps, 'channels/my-favorites', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChannelsMyFavorites(deps, auth.user, body)),
		),
	);

	app.post(
		'/channels/mute/create',
		endpointHandler(deps, 'channels/mute/create', async ({ body, auth, c }) => {
			await handleApiChannelsMuteCreate(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/channels/mute/delete',
		endpointHandler(deps, 'channels/mute/delete', async ({ body, auth, c }) => {
			await handleApiChannelsMuteDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/channels/mute/list',
		endpointHandler(deps, 'channels/mute/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChannelsMuteList(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/channels/owned',
		endpointHandler(deps, 'channels/owned', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChannelsOwned(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/channels/search',
		endpointHandlerAnonymous(deps, 'channels/search', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChannelsSearch(deps, auth.user, body)),
		),
	);

	app.post(
		'/channels/unfavorite',
		endpointHandler(deps, 'channels/unfavorite', async ({ body, auth, c }) => {
			await handleApiChannelsUnfavorite(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/channels/unfollow',
		endpointHandler(deps, 'channels/unfollow', async ({ body, auth, c }) => {
			await handleApiChannelsUnfollow(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/channels/update',
		endpointHandler(deps, 'channels/update', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChannelsUpdate(deps, auth.user, body)),
		),
	);
}
