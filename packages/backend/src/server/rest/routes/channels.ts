/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertProhibitMoved, assertTokenPermission, authenticateHonoApiToken } from '../auth.js';
import { rolePermissionDeniedError } from '../error.js';
import { handleHonoApiChannelsFavorite, handleHonoApiChannelsUnfavorite } from '../favorites.js';
import {
	handleHonoApiChannelsCreate,
	handleHonoApiChannelsFeatured,
	handleHonoApiChannelsFollow,
	handleHonoApiChannelsFollowed,
	handleHonoApiChannelsMuteCreate,
	handleHonoApiChannelsMuteDelete,
	handleHonoApiChannelsMuteList,
	handleHonoApiChannelsMyFavorites,
	handleHonoApiChannelsOwned,
	handleHonoApiChannelsSearch,
	handleHonoApiChannelsShow,
	handleHonoApiChannelsTimeline,
	handleHonoApiChannelsUnfollow,
	handleHonoApiChannelsUpdate,
} from '../channels.js';
import { assertHonoApiRateLimitForUser } from '../rate-limit.js';
import { hasHonoApiRolePolicyOrIsRoot } from '../role-policy.js';
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
			await handleHonoApiChannelsFavorite(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post('/channels/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:channels');
			if (!(await hasHonoApiRolePolicyOrIsRoot(deps, auth.user, 'canCreateChannel'))) {
				throw rolePermissionDeniedError();
			}
			await assertHonoApiRateLimitForUser(
				deps,
				'channels/create',
				{
					duration: 60 * 60 * 1000,
					max: 10,
				},
				auth.user,
			);

			return jsonResponse(c, await handleHonoApiChannelsCreate(deps, auth.user, body));
		});
	});

	app.on(
		['POST', 'QUERY'],
		'/channels/featured',
		endpointHandlerAnonymous(deps, 'channels/featured', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiChannelsFeatured(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/channels/show',
		endpointHandlerAnonymous(deps, 'channels/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiChannelsShow(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/channels/timeline',
		endpointHandlerAnonymous(deps, 'channels/timeline', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiChannelsTimeline(deps, auth.user, body)),
		),
	);

	app.post(
		'/channels/follow',
		endpointHandler(deps, 'channels/follow', async ({ body, auth, c }) => {
			await handleHonoApiChannelsFollow(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/channels/followed',
		endpointHandler(deps, 'channels/followed', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiChannelsFollowed(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/channels/my-favorites',
		endpointHandler(deps, 'channels/my-favorites', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiChannelsMyFavorites(deps, auth.user, body)),
		),
	);

	app.post(
		'/channels/mute/create',
		endpointHandler(deps, 'channels/mute/create', async ({ body, auth, c }) => {
			await handleHonoApiChannelsMuteCreate(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/channels/mute/delete',
		endpointHandler(deps, 'channels/mute/delete', async ({ body, auth, c }) => {
			await handleHonoApiChannelsMuteDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/channels/mute/list',
		endpointHandler(deps, 'channels/mute/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiChannelsMuteList(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/channels/owned',
		endpointHandler(deps, 'channels/owned', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiChannelsOwned(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/channels/search',
		endpointHandlerAnonymous(deps, 'channels/search', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiChannelsSearch(deps, auth.user, body)),
		),
	);

	app.post(
		'/channels/unfavorite',
		endpointHandler(deps, 'channels/unfavorite', async ({ body, auth, c }) => {
			await handleHonoApiChannelsUnfavorite(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/channels/unfollow',
		endpointHandler(deps, 'channels/unfollow', async ({ body, auth, c }) => {
			await handleHonoApiChannelsUnfollow(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/channels/update',
		endpointHandler(deps, 'channels/update', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiChannelsUpdate(deps, auth.user, body)),
		),
	);
}
