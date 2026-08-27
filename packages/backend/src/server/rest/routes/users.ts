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
	authenticateApiToken,
} from '../auth/auth.js';
import { handleApiUsersReportAbuse } from '../admin/admin-abuse-reports.js';
import { handleApiUsernameAvailable } from '../auth/availability.js';
import { handleApiMyApps } from '../auth/app.js';
import { rolePermissionDeniedError } from '../error.js';
import { handleApiUsersGalleryPosts } from '../gallery/gallery.js';
import { handleApiUsersListsFavorite, handleApiUsersListsUnfavorite } from '../favorite/favorites.js';
import { handleApiUsersClips } from '../clip/clips.js';
import { handleApiUsersFlashs } from '../flash/flash.js';
import {
	handleApiUsersFollowers,
	handleApiUsersFollowing,
	handleApiUsersGetFollowingUsersByBirthday,
} from '../user/following.js';
import {
	handleApiUsers,
	handleApiUsersGetFrequentlyRepliedUsers,
	handleApiUsersRecommendation,
	handleApiUsersRelation,
	handleApiUsersSearch,
	handleApiUsersSearchByUsernameAndHost,
	handleApiUsersShow,
	handleApiUsersUpdateMemo,
} from '../user/user.js';
import { handleApiMiauthCheck, handleApiMiauthGenToken } from '../auth/miauth.js';
import {
	handleApiNotesDraftsCount,
	handleApiNotesDraftsCreate,
	handleApiNotesDraftsDelete,
	handleApiNotesDraftsList,
	handleApiNotesDraftsUpdate,
} from '../note/note-drafts.js';
import { handleApiUsersReactions } from '../user/user-reactions.js';
import { handleApiUsersPages } from '../page/pages.js';
import { assertApiRateLimitForUser } from '../rate-limit.js';
import { getApiRolePolicies } from '../role/role-policy.js';
import {
	handleApiUsersAchievements,
	handleApiUsersListsDelete,
	handleApiUsersListsList,
	handleApiUsersListsShow,
	handleApiUsersListsUpdate,
} from '../user/users.js';
import {
	handleApiUsersListsCreate,
	handleApiUsersListsCreateFromPublic,
	handleApiUsersListsGetMemberships,
	handleApiUsersListsPull,
	handleApiUsersListsPush,
	handleApiUsersListsUpdateMembership,
} from '../user/users-lists.js';
import { handleApiVerifyEmail } from '../auth/verify-email.js';
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
			jsonResponse(c, await handleApiMiauthGenToken(deps, auth.user, body)),
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
			return jsonResponse(c, await handleApiMiauthCheck(deps, session));
		});
	});

	app.on(
		['POST', 'QUERY'],
		'/my/apps',
		endpointHandler(deps, 'my/apps', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiMyApps(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/drafts/count',
		endpointHandler(deps, 'notes/drafts/count', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiNotesDraftsCount(deps, auth.user, body)),
		),
	);

	app.post(
		'/notes/drafts/create',
		endpointHandler(deps, 'notes/drafts/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiNotesDraftsCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/notes/drafts/update',
		endpointHandler(deps, 'notes/drafts/update', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiNotesDraftsUpdate(deps, auth.user, body)),
		),
	);

	app.post(
		'/notes/drafts/delete',
		endpointHandler(deps, 'notes/drafts/delete', async ({ body, auth, c }) => {
			await handleApiNotesDraftsDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/drafts/list',
		endpointHandler(deps, 'notes/drafts/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiNotesDraftsList(deps, auth.user, body)),
		),
	);

	app.post('/users/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);
			const ip = getRequestIp(c, deps.config);

			return jsonResponse(c, await handleApiUsersShow(deps, auth.user, body, ip));
		});
	});

	app.on(
		['POST', 'QUERY'],
		'/users/relation',
		endpointHandler(deps, 'users/relation', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiUsersRelation(deps, auth.user, body)),
		),
	);

	app.post(
		'/users',
		endpointHandlerAnonymous(deps, 'users', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiUsers(deps, auth.user, body)),
		),
	);

	app.post(
		'/users/update-memo',
		endpointHandler(deps, 'users/update-memo', async ({ body, auth, c }) => {
			await handleApiUsersUpdateMemo(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/search',
		endpointHandlerAnonymous(deps, 'users/search', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiUsersSearch(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/reactions',
		endpointHandlerAnonymous(deps, 'users/reactions', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiUsersReactions(deps, auth.user, body)),
		),
	);

	app.post(
		'/users/report-abuse',
		endpointHandler(deps, 'users/report-abuse', async ({ body, auth, c }) => {
			await handleApiUsersReportAbuse(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/get-frequently-replied-users',
		endpointHandlerAnonymous(deps, 'users/get-frequently-replied-users', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiUsersGetFrequentlyRepliedUsers(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/search-by-username-and-host',
		endpointHandlerAnonymous(deps, 'users/search-by-username-and-host', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiUsersSearchByUsernameAndHost(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/followers',
		endpointHandlerAnonymous(deps, 'users/followers', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiUsersFollowers(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/following',
		endpointHandlerAnonymous(deps, 'users/following', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiUsersFollowing(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/recommendation',
		endpointHandler(deps, 'users/recommendation', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiUsersRecommendation(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/get-following-users-by-birthday',
		endpointHandler(deps, 'users/get-following-users-by-birthday', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiUsersGetFollowingUsersByBirthday(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/achievements',
		endpointHandlerAnonymous(deps, 'users/achievements', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiUsersAchievements(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/pages',
		endpointHandlerAnonymous(deps, 'users/pages', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiUsersPages(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/clips',
		endpointHandlerAnonymous(deps, 'users/clips', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiUsersClips(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/flashs',
		endpointHandlerAnonymous(deps, 'users/flashs', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiUsersFlashs(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/gallery/posts',
		endpointHandlerAnonymous(deps, 'users/gallery/posts', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiUsersGalleryPosts(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/lists/list',
		endpointHandlerAnonymous(deps, 'users/lists/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiUsersListsList(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/lists/show',
		endpointHandlerAnonymous(deps, 'users/lists/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiUsersListsShow(deps, auth.user, body)),
		),
	);

	app.post(
		'/users/lists/delete',
		endpointHandler(deps, 'users/lists/delete', async ({ body, auth, c }) => {
			await handleApiUsersListsDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/users/lists/update',
		endpointHandler(deps, 'users/lists/update', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiUsersListsUpdate(deps, auth.user, body)),
		),
	);

	app.post(
		'/users/lists/favorite',
		endpointHandler(deps, 'users/lists/favorite', async ({ body, auth, c }) => {
			await handleApiUsersListsFavorite(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/users/lists/unfavorite',
		endpointHandler(deps, 'users/lists/unfavorite', async ({ body, auth, c }) => {
			await handleApiUsersListsUnfavorite(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/users/lists/create',
		endpointHandler(deps, 'users/lists/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiUsersListsCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/users/lists/create-from-public',
		endpointHandler(deps, 'users/lists/create-from-public', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiUsersListsCreateFromPublic(deps, auth.user, body)),
		),
	);

	app.post(
		'/users/lists/pull',
		endpointHandler(deps, 'users/lists/pull', async ({ body, auth, c }) => {
			await handleApiUsersListsPull(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/users/lists/push',
		endpointHandler(deps, 'users/lists/push', async ({ body, auth, c }) => {
			await handleApiUsersListsPush(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/users/lists/get-memberships',
		endpointHandlerAnonymous(deps, 'users/lists/get-memberships', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiUsersListsGetMemberships(deps, auth.user, body)),
		),
	);

	app.post(
		'/users/lists/update-membership',
		endpointHandler(deps, 'users/lists/update-membership', async ({ body, auth, c }) => {
			await handleApiUsersListsUpdateMembership(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/username/available',
		endpointHandlerAnonymous(deps, 'username/available', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiUsernameAvailable(deps, body)),
		),
	);

	app.post(
		'/verify-email',
		endpointHandlerAnonymous(deps, 'verify-email', async ({ body, auth, c }) => {
			await authenticateOptionalRequest(deps, c, body);

			await handleApiVerifyEmail(deps, body);
			return emptyResponse(c);
		}),
	);
}
