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

export function registerFollowingGalleryFlashRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post('/following/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:following');
			await assertHonoApiRateLimitForUser(
				deps,
				'following/create',
				{
					duration: 60 * 60 * 1000,
					max: 100,
				},
				auth.user,
			);

			return jsonResponse(c, await handleHonoApiFollowingCreate(deps, auth.user, body));
		});
	});

	app.post('/following/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:following');

			return jsonResponse(c, await handleHonoApiFollowingList(deps, auth.user, body));
		});
	});

	app.post('/following/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:following');
			await assertHonoApiRateLimitForUser(
				deps,
				'following/delete',
				{
					duration: 60 * 60 * 1000,
					max: 100,
				},
				auth.user,
			);

			return jsonResponse(c, await handleHonoApiFollowingDelete(deps, auth.user, body));
		});
	});

	app.post('/following/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:following');
			await assertHonoApiRateLimitForUser(
				deps,
				'following/update',
				{
					duration: 60 * 60 * 1000,
					max: 100,
				},
				auth.user,
			);

			return jsonResponse(c, await handleHonoApiFollowingUpdate(deps, auth.user, body));
		});
	});

	app.post('/following/invalidate', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:following');
			await assertHonoApiRateLimitForUser(
				deps,
				'following/invalidate',
				{
					duration: 60 * 60 * 1000,
					max: 100,
				},
				auth.user,
			);

			return jsonResponse(c, await handleHonoApiFollowingInvalidate(deps, auth.user, body));
		});
	});

	app.post('/following/requests/accept', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:following');

			await handleHonoApiFollowingRequestsAccept(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/following/requests/cancel', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:following');

			return jsonResponse(c, await handleHonoApiFollowingRequestsCancel(deps, auth.user, body));
		});
	});

	app.post('/following/requests/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:following');

			return jsonResponse(c, await handleHonoApiFollowingRequestsList(deps, auth.user, body));
		});
	});

	app.post('/following/requests/reject', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:following');

			await handleHonoApiFollowingRequestsReject(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/following/requests/sent', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:following');

			return jsonResponse(c, await handleHonoApiFollowingRequestsSent(deps, auth.user, body));
		});
	});

	app.post('/gallery/featured', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiGalleryFeatured(deps, auth.user, body));
		});
	});

	app.post('/gallery/popular', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiGalleryPopular(deps, auth.user, body));
		});
	});

	app.post('/gallery/posts', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiGalleryPosts(deps, auth.user, body));
		});
	});

	app.post('/gallery/posts/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiGalleryPostsShow(deps, auth.user, body));
		});
	});

	app.post('/gallery/posts/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:gallery');
			await assertHonoApiRateLimitForUser(
				deps,
				'gallery/posts/create',
				{
					duration: 60 * 60 * 1000,
					max: 20,
				},
				auth.user,
			);

			return jsonResponse(c, await handleHonoApiGalleryPostsCreate(deps, auth.user, body));
		});
	});

	app.post('/gallery/posts/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:gallery');
			await assertHonoApiRateLimitForUser(
				deps,
				'gallery/posts/update',
				{
					duration: 60 * 60 * 1000,
					max: 300,
				},
				auth.user,
			);

			return jsonResponse(c, await handleHonoApiGalleryPostsUpdate(deps, auth.user, body));
		});
	});

	app.post('/gallery/posts/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:gallery');

			await handleHonoApiGalleryPostsDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/gallery/posts/like', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:gallery-likes');

			await handleHonoApiGalleryPostsLike(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/gallery/posts/unlike', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:gallery-likes');

			await handleHonoApiGalleryPostsUnlike(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/i/gallery/posts', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:gallery');

			return jsonResponse(c, await handleHonoApiIGalleryPosts(deps, auth.user, body));
		});
	});

	app.post('/i/gallery/likes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:gallery-likes');

			return jsonResponse(c, await handleHonoApiIGalleryLikes(deps, auth.user, body));
		});
	});

	app.post('/flash/like', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:flash-likes');

			await handleHonoApiFlashLike(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/flash/unlike', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:flash-likes');

			await handleHonoApiFlashUnlike(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/flash/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:flash');
			await assertHonoApiRateLimitForUser(
				deps,
				'flash/update',
				{
					duration: 60 * 60 * 1000,
					max: 300,
				},
				auth.user,
			);

			await handleHonoApiFlashUpdate(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/flash/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:flash');
			await assertHonoApiRateLimitForUser(
				deps,
				'flash/create',
				{
					duration: 60 * 60 * 1000,
					max: 10,
				},
				auth.user,
			);

			return jsonResponse(c, await handleHonoApiFlashCreate(deps, auth.user, body));
		});
	});

	app.post('/flash/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:flash');

			await handleHonoApiFlashDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/flash/featured', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiFlashFeatured(deps, auth.user, body));
		});
	});

	app.post('/flash/my', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:flash');

			return jsonResponse(c, await handleHonoApiFlashMy(deps, auth.user, body));
		});
	});

	app.post('/flash/my-likes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:flash-likes');

			return jsonResponse(c, await handleHonoApiFlashMyLikes(deps, auth.user, body));
		});
	});

	app.post('/flash/search', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiFlashSearch(deps, auth.user, body));
		});
	});

	app.post('/flash/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiFlashShow(deps, auth.user, body));
		});
	});

	app.post('/following/update-all', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:following');
			await assertHonoApiRateLimitForUser(
				deps,
				'following/update-all',
				{
					duration: 60 * 60 * 1000,
					max: 10,
				},
				auth.user,
			);

			await handleHonoApiFollowingUpdateAll(deps, auth.user, body);
			return emptyResponse(c);
		});
	});
}
