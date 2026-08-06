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

export function registerChannelsRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post('/channels/favorite', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:channels');

			await handleHonoApiChannelsFavorite(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

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

	app.post('/channels/featured', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChannelsFeatured(deps, auth.user, body));
		});
	});

	app.post('/channels/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChannelsShow(deps, auth.user, body));
		});
	});

	app.post('/channels/timeline', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChannelsTimeline(deps, auth.user, body));
		});
	});

	app.post('/channels/follow', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:channels');

			await handleHonoApiChannelsFollow(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/channels/followed', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:channels');

			return jsonResponse(c, await handleHonoApiChannelsFollowed(deps, auth.user, body));
		});
	});

	app.post('/channels/my-favorites', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:channels');

			return jsonResponse(c, await handleHonoApiChannelsMyFavorites(deps, auth.user, body));
		});
	});

	app.post('/channels/mute/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:channels');

			await handleHonoApiChannelsMuteCreate(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/channels/mute/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:channels');

			await handleHonoApiChannelsMuteDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/channels/mute/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'read:channels');

			return jsonResponse(c, await handleHonoApiChannelsMuteList(deps, auth.user, body));
		});
	});

	app.post('/channels/owned', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:channels');

			return jsonResponse(c, await handleHonoApiChannelsOwned(deps, auth.user, body));
		});
	});

	app.post('/channels/search', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChannelsSearch(deps, auth.user, body));
		});
	});

	app.post('/channels/unfavorite', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:channels');

			await handleHonoApiChannelsUnfavorite(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/channels/unfollow', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:channels');

			await handleHonoApiChannelsUnfollow(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/channels/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:channels');

			return jsonResponse(c, await handleHonoApiChannelsUpdate(deps, auth.user, body));
		});
	});
}
