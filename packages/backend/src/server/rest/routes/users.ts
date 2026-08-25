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
import { handleHonoApiUsersReportAbuse } from '../admin-abuse-reports.js';
import { handleHonoApiUsernameAvailable } from '../availability.js';
import { handleHonoApiMyApps } from '../app.js';
import { rolePermissionDeniedError } from '../error.js';
import { handleHonoApiUsersGalleryPosts } from '../gallery.js';
import { handleHonoApiUsersListsFavorite, handleHonoApiUsersListsUnfavorite } from '../favorites.js';
import { handleHonoApiUsersClips } from '../clips.js';
import { handleHonoApiUsersFlashs } from '../flash.js';
import {
	handleHonoApiUsersFollowers,
	handleHonoApiUsersFollowing,
	handleHonoApiUsersGetFollowingUsersByBirthday,
} from '../following.js';
import {
	handleHonoApiUsers,
	handleHonoApiUsersGetFrequentlyRepliedUsers,
	handleHonoApiUsersRecommendation,
	handleHonoApiUsersRelation,
	handleHonoApiUsersSearch,
	handleHonoApiUsersSearchByUsernameAndHost,
	handleHonoApiUsersShow,
	handleHonoApiUsersUpdateMemo,
} from '../user.js';
import { handleHonoApiMiauthCheck, handleHonoApiMiauthGenToken } from '../miauth.js';
import {
	handleHonoApiNotesDraftsCount,
	handleHonoApiNotesDraftsCreate,
	handleHonoApiNotesDraftsDelete,
	handleHonoApiNotesDraftsList,
	handleHonoApiNotesDraftsUpdate,
} from '../note-drafts.js';
import { handleHonoApiUsersReactions } from '../user-reactions.js';
import { handleHonoApiUsersPages } from '../pages.js';
import { assertHonoApiRateLimitForUser } from '../rate-limit.js';
import { getHonoApiRolePolicies } from '../role-policy.js';
import {
	handleHonoApiUsersAchievements,
	handleHonoApiUsersListsDelete,
	handleHonoApiUsersListsList,
	handleHonoApiUsersListsShow,
	handleHonoApiUsersListsUpdate,
} from '../users.js';
import {
	handleHonoApiUsersListsCreate,
	handleHonoApiUsersListsCreateFromPublic,
	handleHonoApiUsersListsGetMemberships,
	handleHonoApiUsersListsPull,
	handleHonoApiUsersListsPush,
	handleHonoApiUsersListsUpdateMembership,
} from '../users-lists.js';
import { handleHonoApiVerifyEmail } from '../verify-email.js';
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

export function registerUsersRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post(
		'/miauth/gen-token',
		endpointHandler(deps, 'miauth/gen-token', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiMiauthGenToken(deps, auth.user, body)),
		),
	);

	// URL は MiAuth プロトコルの公開仕様 (`/api/miauth/{session}/check`) なので変えられないが、
	// `/miauth/gen-token` (static) と `/miauth/:session/check` (param) の同一位置共存は
	// RegExpRouter 非対応で、この1ルートのせいでアプリ全体が TrieRouter へフォールバックする。
	// ワイルドカードで受けてパスから session を自前で切り出す (shape 不一致は
	// 後段の catch-all による UNKNOWN_API_ENDPOINT 404 に流す)。
	app.post('/miauth/*', async (c, next) => {
		// c.req.path はマウントプレフィックス (/api) 込みのフルパスなので末尾側でマッチする
		const match = /\/miauth\/([^/]+)\/check$/.exec(c.req.path);
		if (match == null) return await next();

		let session = match[1];
		if (session == null) return await next();
		try {
			session = decodeURIComponent(session);
		} catch {
			// 不正な percent-encoding はデコードせず、そのまま扱う。
		}

		return await runApiEndpoint(c, async () => {
			return jsonResponse(c, await handleHonoApiMiauthCheck(deps, session));
		});
	});

	app.on(
		['POST', 'QUERY'],
		'/my/apps',
		endpointHandler(deps, 'my/apps', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiMyApps(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/drafts/count',
		endpointHandler(deps, 'notes/drafts/count', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiNotesDraftsCount(deps, auth.user, body)),
		),
	);

	app.post('/notes/drafts/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');
			await assertHonoApiRateLimitForUser(
				deps,
				'notes/drafts/create',
				{
					duration: 60 * 60 * 1000,
					max: 300,
				},
				auth.user,
			);

			return jsonResponse(c, await handleHonoApiNotesDraftsCreate(deps, auth.user, body));
		});
	});

	app.post('/notes/drafts/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');
			await assertHonoApiRateLimitForUser(
				deps,
				'notes/drafts/update',
				{
					duration: 60 * 60 * 1000,
					max: 300,
				},
				auth.user,
			);

			return jsonResponse(c, await handleHonoApiNotesDraftsUpdate(deps, auth.user, body));
		});
	});

	app.post(
		'/notes/drafts/delete',
		endpointHandler(deps, 'notes/drafts/delete', async ({ body, auth, c }) => {
			await handleHonoApiNotesDraftsDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/drafts/list',
		endpointHandler(deps, 'notes/drafts/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiNotesDraftsList(deps, auth.user, body)),
		),
	);

	app.post('/users/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);
			const ip = getRequestIp(c, deps.config);

			return jsonResponse(c, await handleHonoApiUsersShow(deps, auth.user, body, ip));
		});
	});

	app.on(
		['POST', 'QUERY'],
		'/users/relation',
		endpointHandler(deps, 'users/relation', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiUsersRelation(deps, auth.user, body)),
		),
	);

	app.post(
		'/users',
		endpointHandlerAnonymous(deps, 'users', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiUsers(deps, auth.user, body)),
		),
	);

	app.post(
		'/users/update-memo',
		endpointHandler(deps, 'users/update-memo', async ({ body, auth, c }) => {
			await handleHonoApiUsersUpdateMemo(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/search',
		endpointHandlerAnonymous(deps, 'users/search', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiUsersSearch(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/reactions',
		endpointHandlerAnonymous(deps, 'users/reactions', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiUsersReactions(deps, auth.user, body)),
		),
	);

	app.post(
		'/users/report-abuse',
		endpointHandler(deps, 'users/report-abuse', async ({ body, auth, c }) => {
			await handleHonoApiUsersReportAbuse(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/get-frequently-replied-users',
		endpointHandlerAnonymous(deps, 'users/get-frequently-replied-users', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiUsersGetFrequentlyRepliedUsers(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/search-by-username-and-host',
		endpointHandlerAnonymous(deps, 'users/search-by-username-and-host', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiUsersSearchByUsernameAndHost(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/followers',
		endpointHandlerAnonymous(deps, 'users/followers', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiUsersFollowers(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/following',
		endpointHandlerAnonymous(deps, 'users/following', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiUsersFollowing(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/recommendation',
		endpointHandler(deps, 'users/recommendation', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiUsersRecommendation(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/get-following-users-by-birthday',
		endpointHandler(deps, 'users/get-following-users-by-birthday', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiUsersGetFollowingUsersByBirthday(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/achievements',
		endpointHandler(deps, 'users/achievements', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiUsersAchievements(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/pages',
		endpointHandler(deps, 'users/pages', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiUsersPages(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/clips',
		endpointHandlerAnonymous(deps, 'users/clips', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiUsersClips(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/flashs',
		endpointHandler(deps, 'users/flashs', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiUsersFlashs(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/gallery/posts',
		endpointHandlerAnonymous(deps, 'users/gallery/posts', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiUsersGalleryPosts(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/lists/list',
		endpointHandlerAnonymous(deps, 'users/lists/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiUsersListsList(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/lists/show',
		endpointHandlerAnonymous(deps, 'users/lists/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiUsersListsShow(deps, auth.user, body)),
		),
	);

	app.post(
		'/users/lists/delete',
		endpointHandler(deps, 'users/lists/delete', async ({ body, auth, c }) => {
			await handleHonoApiUsersListsDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/users/lists/update',
		endpointHandler(deps, 'users/lists/update', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiUsersListsUpdate(deps, auth.user, body)),
		),
	);

	app.post(
		'/users/lists/favorite',
		endpointHandler(deps, 'users/lists/favorite', async ({ body, auth, c }) => {
			await handleHonoApiUsersListsFavorite(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/users/lists/unfavorite',
		endpointHandler(deps, 'users/lists/unfavorite', async ({ body, auth, c }) => {
			await handleHonoApiUsersListsUnfavorite(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/users/lists/create',
		endpointHandler(deps, 'users/lists/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiUsersListsCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/users/lists/create-from-public',
		endpointHandler(deps, 'users/lists/create-from-public', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiUsersListsCreateFromPublic(deps, auth.user, body)),
		),
	);

	app.post(
		'/users/lists/pull',
		endpointHandler(deps, 'users/lists/pull', async ({ body, auth, c }) => {
			await handleHonoApiUsersListsPull(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post('/users/lists/push', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');
			await assertHonoApiRateLimitForUser(
				deps,
				'users/lists/push',
				{
					duration: 60 * 60 * 1000,
					max: 30,
				},
				auth.user,
			);

			await handleHonoApiUsersListsPush(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.on(
		['POST', 'QUERY'],
		'/users/lists/get-memberships',
		endpointHandlerAnonymous(deps, 'users/lists/get-memberships', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiUsersListsGetMemberships(deps, auth.user, body)),
		),
	);

	app.post(
		'/users/lists/update-membership',
		endpointHandler(deps, 'users/lists/update-membership', async ({ body, auth, c }) => {
			await handleHonoApiUsersListsUpdateMembership(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/username/available',
		endpointHandler(deps, 'username/available', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiUsernameAvailable(deps, body)),
		),
	);

	app.post(
		'/verify-email',
		endpointHandlerAnonymous(deps, 'verify-email', async ({ body, auth, c }) => {
			await authenticateOptionalRequest(deps, c, body);

			await handleHonoApiVerifyEmail(deps, body);
			return emptyResponse(c);
		}),
	);
}
