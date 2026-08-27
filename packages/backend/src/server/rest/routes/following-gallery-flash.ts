/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertProhibitMoved, assertTokenPermission, authenticateApiToken } from '../auth/auth.js';
import {
	handleApiGalleryFeatured,
	handleApiGalleryPopular,
	handleApiGalleryPosts,
	handleApiGalleryPostsCreate,
	handleApiGalleryPostsDelete,
	handleApiGalleryPostsLike,
	handleApiGalleryPostsShow,
	handleApiGalleryPostsUnlike,
	handleApiGalleryPostsUpdate,
	handleApiIGalleryLikes,
	handleApiIGalleryPosts,
} from '../gallery/gallery.js';
import { handleApiFlashLike, handleApiFlashUnlike } from '../favorite/favorites.js';
import {
	handleApiFlashCreate,
	handleApiFlashDelete,
	handleApiFlashFeatured,
	handleApiFlashMy,
	handleApiFlashMyLikes,
	handleApiFlashSearch,
	handleApiFlashShow,
	handleApiFlashUpdate,
} from '../flash/flash.js';
import {
	handleApiFollowingCreate,
	handleApiFollowingDelete,
	handleApiFollowingInvalidate,
	handleApiFollowingList,
	handleApiFollowingRequestsAccept,
	handleApiFollowingRequestsCancel,
	handleApiFollowingRequestsList,
	handleApiFollowingRequestsReject,
	handleApiFollowingRequestsSent,
	handleApiFollowingUpdate,
	handleApiFollowingUpdateAll,
} from '../user/following.js';
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

export function registerFollowingGalleryFlashRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post(
		'/following/create',
		endpointHandler(deps, 'following/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiFollowingCreate(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/following/list',
		endpointHandler(deps, 'following/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiFollowingList(deps, auth.user, body)),
		),
	);

	app.post(
		'/following/delete',
		endpointHandler(deps, 'following/delete', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiFollowingDelete(deps, auth.user, body)),
		),
	);

	app.post(
		'/following/update',
		endpointHandler(deps, 'following/update', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiFollowingUpdate(deps, auth.user, body)),
		),
	);

	app.post(
		'/following/invalidate',
		endpointHandler(deps, 'following/invalidate', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiFollowingInvalidate(deps, auth.user, body)),
		),
	);

	app.post(
		'/following/requests/accept',
		endpointHandler(deps, 'following/requests/accept', async ({ body, auth, c }) => {
			await handleApiFollowingRequestsAccept(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/following/requests/cancel',
		endpointHandler(deps, 'following/requests/cancel', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiFollowingRequestsCancel(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/following/requests/list',
		endpointHandler(deps, 'following/requests/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiFollowingRequestsList(deps, auth.user, body)),
		),
	);

	app.post(
		'/following/requests/reject',
		endpointHandler(deps, 'following/requests/reject', async ({ body, auth, c }) => {
			await handleApiFollowingRequestsReject(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/following/requests/sent',
		endpointHandler(deps, 'following/requests/sent', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiFollowingRequestsSent(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/gallery/featured',
		endpointHandlerAnonymous(deps, 'gallery/featured', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiGalleryFeatured(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/gallery/popular',
		endpointHandlerAnonymous(deps, 'gallery/popular', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiGalleryPopular(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/gallery/posts',
		endpointHandlerAnonymous(deps, 'gallery/posts', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiGalleryPosts(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/gallery/posts/show',
		endpointHandlerAnonymous(deps, 'gallery/posts/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiGalleryPostsShow(deps, auth.user, body)),
		),
	);

	app.post(
		'/gallery/posts/create',
		endpointHandler(deps, 'gallery/posts/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiGalleryPostsCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/gallery/posts/update',
		endpointHandler(deps, 'gallery/posts/update', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiGalleryPostsUpdate(deps, auth.user, body)),
		),
	);

	app.post(
		'/gallery/posts/delete',
		endpointHandler(deps, 'gallery/posts/delete', async ({ body, auth, c }) => {
			await handleApiGalleryPostsDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/gallery/posts/like',
		endpointHandler(deps, 'gallery/posts/like', async ({ body, auth, c }) => {
			await handleApiGalleryPostsLike(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/gallery/posts/unlike',
		endpointHandler(deps, 'gallery/posts/unlike', async ({ body, auth, c }) => {
			await handleApiGalleryPostsUnlike(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/gallery/posts',
		endpointHandler(deps, 'i/gallery/posts', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiIGalleryPosts(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/gallery/likes',
		endpointHandler(deps, 'i/gallery/likes', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiIGalleryLikes(deps, auth.user, body)),
		),
	);

	app.post(
		'/flash/like',
		endpointHandler(deps, 'flash/like', async ({ body, auth, c }) => {
			await handleApiFlashLike(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/flash/unlike',
		endpointHandler(deps, 'flash/unlike', async ({ body, auth, c }) => {
			await handleApiFlashUnlike(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/flash/update',
		endpointHandler(deps, 'flash/update', async ({ body, auth, c }) => {
			await handleApiFlashUpdate(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/flash/create',
		endpointHandler(deps, 'flash/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiFlashCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/flash/delete',
		endpointHandler(deps, 'flash/delete', async ({ body, auth, c }) => {
			await handleApiFlashDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/flash/featured',
		endpointHandlerAnonymous(deps, 'flash/featured', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiFlashFeatured(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/flash/my',
		endpointHandler(deps, 'flash/my', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiFlashMy(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/flash/my-likes',
		endpointHandler(deps, 'flash/my-likes', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiFlashMyLikes(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/flash/search',
		endpointHandlerAnonymous(deps, 'flash/search', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiFlashSearch(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/flash/show',
		endpointHandlerAnonymous(deps, 'flash/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiFlashShow(deps, auth.user, body)),
		),
	);

	app.post(
		'/following/update-all',
		endpointHandler(deps, 'following/update-all', async ({ body, auth, c }) => {
			await handleApiFollowingUpdateAll(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);
}
