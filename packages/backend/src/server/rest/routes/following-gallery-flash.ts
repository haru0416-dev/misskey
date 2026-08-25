/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertProhibitMoved, assertTokenPermission, authenticateHonoApiToken } from '../auth.js';
import {
	handleHonoApiGalleryFeatured,
	handleHonoApiGalleryPopular,
	handleHonoApiGalleryPosts,
	handleHonoApiGalleryPostsCreate,
	handleHonoApiGalleryPostsDelete,
	handleHonoApiGalleryPostsLike,
	handleHonoApiGalleryPostsShow,
	handleHonoApiGalleryPostsUnlike,
	handleHonoApiGalleryPostsUpdate,
	handleHonoApiIGalleryLikes,
	handleHonoApiIGalleryPosts,
} from '../gallery.js';
import { handleHonoApiFlashLike, handleHonoApiFlashUnlike } from '../favorites.js';
import {
	handleHonoApiFlashCreate,
	handleHonoApiFlashDelete,
	handleHonoApiFlashFeatured,
	handleHonoApiFlashMy,
	handleHonoApiFlashMyLikes,
	handleHonoApiFlashSearch,
	handleHonoApiFlashShow,
	handleHonoApiFlashUpdate,
} from '../flash.js';
import {
	handleHonoApiFollowingCreate,
	handleHonoApiFollowingDelete,
	handleHonoApiFollowingInvalidate,
	handleHonoApiFollowingList,
	handleHonoApiFollowingRequestsAccept,
	handleHonoApiFollowingRequestsCancel,
	handleHonoApiFollowingRequestsList,
	handleHonoApiFollowingRequestsReject,
	handleHonoApiFollowingRequestsSent,
	handleHonoApiFollowingUpdate,
	handleHonoApiFollowingUpdateAll,
} from '../following.js';
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

export function registerFollowingGalleryFlashRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post(
		'/following/create',
		endpointHandler(deps, 'following/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiFollowingCreate(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/following/list',
		endpointHandler(deps, 'following/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiFollowingList(deps, auth.user, body)),
		),
	);

	app.post(
		'/following/delete',
		endpointHandler(deps, 'following/delete', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiFollowingDelete(deps, auth.user, body)),
		),
	);

	app.post(
		'/following/update',
		endpointHandler(deps, 'following/update', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiFollowingUpdate(deps, auth.user, body)),
		),
	);

	app.post(
		'/following/invalidate',
		endpointHandler(deps, 'following/invalidate', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiFollowingInvalidate(deps, auth.user, body)),
		),
	);

	app.post(
		'/following/requests/accept',
		endpointHandler(deps, 'following/requests/accept', async ({ body, auth, c }) => {
			await handleHonoApiFollowingRequestsAccept(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/following/requests/cancel',
		endpointHandler(deps, 'following/requests/cancel', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiFollowingRequestsCancel(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/following/requests/list',
		endpointHandler(deps, 'following/requests/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiFollowingRequestsList(deps, auth.user, body)),
		),
	);

	app.post(
		'/following/requests/reject',
		endpointHandler(deps, 'following/requests/reject', async ({ body, auth, c }) => {
			await handleHonoApiFollowingRequestsReject(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/following/requests/sent',
		endpointHandler(deps, 'following/requests/sent', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiFollowingRequestsSent(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/gallery/featured',
		endpointHandlerAnonymous(deps, 'gallery/featured', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiGalleryFeatured(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/gallery/popular',
		endpointHandlerAnonymous(deps, 'gallery/popular', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiGalleryPopular(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/gallery/posts',
		endpointHandlerAnonymous(deps, 'gallery/posts', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiGalleryPosts(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/gallery/posts/show',
		endpointHandlerAnonymous(deps, 'gallery/posts/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiGalleryPostsShow(deps, auth.user, body)),
		),
	);

	app.post(
		'/gallery/posts/create',
		endpointHandler(deps, 'gallery/posts/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiGalleryPostsCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/gallery/posts/update',
		endpointHandler(deps, 'gallery/posts/update', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiGalleryPostsUpdate(deps, auth.user, body)),
		),
	);

	app.post(
		'/gallery/posts/delete',
		endpointHandler(deps, 'gallery/posts/delete', async ({ body, auth, c }) => {
			await handleHonoApiGalleryPostsDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/gallery/posts/like',
		endpointHandler(deps, 'gallery/posts/like', async ({ body, auth, c }) => {
			await handleHonoApiGalleryPostsLike(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/gallery/posts/unlike',
		endpointHandler(deps, 'gallery/posts/unlike', async ({ body, auth, c }) => {
			await handleHonoApiGalleryPostsUnlike(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/gallery/posts',
		endpointHandler(deps, 'i/gallery/posts', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiIGalleryPosts(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/gallery/likes',
		endpointHandler(deps, 'i/gallery/likes', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiIGalleryLikes(deps, auth.user, body)),
		),
	);

	app.post(
		'/flash/like',
		endpointHandler(deps, 'flash/like', async ({ body, auth, c }) => {
			await handleHonoApiFlashLike(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/flash/unlike',
		endpointHandler(deps, 'flash/unlike', async ({ body, auth, c }) => {
			await handleHonoApiFlashUnlike(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/flash/update',
		endpointHandler(deps, 'flash/update', async ({ body, auth, c }) => {
			await handleHonoApiFlashUpdate(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/flash/create',
		endpointHandler(deps, 'flash/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiFlashCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/flash/delete',
		endpointHandler(deps, 'flash/delete', async ({ body, auth, c }) => {
			await handleHonoApiFlashDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/flash/featured',
		endpointHandlerAnonymous(deps, 'flash/featured', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiFlashFeatured(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/flash/my',
		endpointHandler(deps, 'flash/my', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiFlashMy(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/flash/my-likes',
		endpointHandler(deps, 'flash/my-likes', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiFlashMyLikes(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/flash/search',
		endpointHandlerAnonymous(deps, 'flash/search', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiFlashSearch(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/flash/show',
		endpointHandlerAnonymous(deps, 'flash/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiFlashShow(deps, auth.user, body)),
		),
	);

	app.post(
		'/following/update-all',
		endpointHandler(deps, 'following/update-all', async ({ body, auth, c }) => {
			await handleHonoApiFollowingUpdateAll(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);
}
