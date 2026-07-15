/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertProhibitMoved, assertSecureCredential, assertTokenPermission, authenticateHonoApiToken } from '../auth.js';
import { handleHonoApiUsersReportAbuse } from '../admin-abuse-reports.js';
import { handleHonoApiUsernameAvailable } from '../availability.js';
import { handleHonoApiMyApps } from '../app.js';
import { rolePermissionDeniedError } from '../error.js';
import { handleHonoApiUsersGalleryPosts } from '../gallery.js';
import { handleHonoApiUsersListsFavorite, handleHonoApiUsersListsUnfavorite } from '../favorites.js';
import { handleHonoApiUsersClips } from '../clips.js';
import { handleHonoApiUsersFlashs } from '../flash.js';
import { handleHonoApiUsersFollowers, handleHonoApiUsersFollowing, handleHonoApiUsersGetFollowingUsersByBirthday } from '../following.js';
import { handleHonoApiUsers, handleHonoApiUsersGetFrequentlyRepliedUsers, handleHonoApiUsersRecommendation, handleHonoApiUsersRelation, handleHonoApiUsersSearch, handleHonoApiUsersSearchByUsernameAndHost, handleHonoApiUsersShow, handleHonoApiUsersUpdateMemo } from '../user.js';
import { handleHonoApiMiauthCheck, handleHonoApiMiauthGenToken } from '../miauth.js';
import { handleHonoApiNotesDraftsCount, handleHonoApiNotesDraftsCreate, handleHonoApiNotesDraftsDelete, handleHonoApiNotesDraftsList, handleHonoApiNotesDraftsUpdate } from '../note-drafts.js';
import { handleHonoApiUsersReactions } from '../user-reactions.js';
import { handleHonoApiUsersPages } from '../pages.js';
import { assertHonoApiRateLimitForUser } from '../rate-limit.js';
import { getHonoApiRolePolicies } from '../role-policy.js';
import { handleHonoApiUsersAchievements, handleHonoApiUsersListsDelete, handleHonoApiUsersListsList, handleHonoApiUsersListsShow, handleHonoApiUsersListsUpdate } from '../users.js';
import { handleHonoApiUsersListsCreate, handleHonoApiUsersListsCreateFromPublic, handleHonoApiUsersListsGetMemberships, handleHonoApiUsersListsPull, handleHonoApiUsersListsPush, handleHonoApiUsersListsUpdateMembership } from '../users-lists.js';
import { handleHonoApiVerifyEmail } from '../verify-email.js';
import { jsonResponse, emptyResponse, jsonBody, tokenFromRequest, getRequestIp, runApiEndpoint, authenticateOptionalRequest } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';

export function registerUsersRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post('/miauth/gen-token', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			return jsonResponse(c, await handleHonoApiMiauthGenToken(deps, auth.user, body));
		});
	});

	// URL は MiAuth プロトコルの公開仕様 (`/api/miauth/{session}/check`) なので変えられないが、
	// `/miauth/gen-token` (static) と `/miauth/:session/check` (param) の同一位置共存は
	// RegExpRouter 非対応で、この1ルートのせいでアプリ全体が TrieRouter へフォールバックする。
	// ワイルドカードで受けてパスから session を自前で切り出す (shape不一致は従来どおり
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
			// 不正なpercent-encodingはデコードせずそのまま扱う (旧パラメータ抽出と同じ寛容さ)
		}

		return await runApiEndpoint(c, async () => {
			return jsonResponse(c, await handleHonoApiMiauthCheck(deps, session));
		});
	});

	app.post('/my/apps', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiMyApps(deps, auth.user, body));
		});
	});

	app.post('/notes/drafts/count', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiNotesDraftsCount(deps, auth.user, body));
		});
	});

	app.post('/notes/drafts/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');
			await assertHonoApiRateLimitForUser(deps, 'notes/drafts/create', {
				duration: 60 * 60 * 1000,
				max: 300,
			}, auth.user);

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
			await assertHonoApiRateLimitForUser(deps, 'notes/drafts/update', {
				duration: 60 * 60 * 1000,
				max: 300,
			}, auth.user);

			return jsonResponse(c, await handleHonoApiNotesDraftsUpdate(deps, auth.user, body));
		});
	});

	app.post('/notes/drafts/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiNotesDraftsDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/notes/drafts/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiNotesDraftsList(deps, auth.user, body));
		});
	});

	app.post('/users/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);
			const ip = getRequestIp(c, deps.config);

			return jsonResponse(c, await handleHonoApiUsersShow(deps, auth.user, body, ip));
		});
	});

	app.post('/users/relation', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiUsersRelation(deps, auth.user, body));
		});
	});

	app.post('/users', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiUsers(deps, auth.user, body));
		});
	});

	app.post('/users/update-memo', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiUsersUpdateMemo(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/users/search', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);
			if (!(await getHonoApiRolePolicies(deps, auth.user)).canSearchUsers) {
				throw rolePermissionDeniedError();
			}

			return jsonResponse(c, await handleHonoApiUsersSearch(deps, auth.user, body));
		});
	});

	app.post('/users/reactions', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiUsersReactions(deps, auth.user, body));
		});
	});

	app.post('/users/report-abuse', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:report-abuse');

			await handleHonoApiUsersReportAbuse(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/users/get-frequently-replied-users', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiUsersGetFrequentlyRepliedUsers(deps, auth.user, body));
		});
	});

	app.post('/users/search-by-username-and-host', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiUsersSearchByUsernameAndHost(deps, auth.user, body));
		});
	});

	app.post('/users/followers', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiUsersFollowers(deps, auth.user, body));
		});
	});

	app.post('/users/following', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiUsersFollowing(deps, auth.user, body));
		});
	});

	app.post('/users/recommendation', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiUsersRecommendation(deps, auth.user, body));
		});
	});

	app.post('/users/get-following-users-by-birthday', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiUsersGetFollowingUsersByBirthday(deps, auth.user, body));
		});
	});

	app.post('/users/achievements', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiUsersAchievements(deps, body));
		});
	});

	app.post('/users/pages', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiUsersPages(deps, body));
		});
	});

	app.post('/users/clips', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiUsersClips(deps, auth.user, body));
		});
	});

	app.post('/users/flashs', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);

			return jsonResponse(c, await handleHonoApiUsersFlashs(deps, body));
		});
	});

	app.post('/users/gallery/posts', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiUsersGalleryPosts(deps, auth.user, body));
		});
	});

	app.post('/users/lists/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiUsersListsList(deps, auth.user, body));
		});
	});

	app.post('/users/lists/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiUsersListsShow(deps, auth.user, body));
		});
	});

	app.post('/users/lists/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiUsersListsDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/users/lists/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			return jsonResponse(c, await handleHonoApiUsersListsUpdate(deps, auth.user, body));
		});
	});

	app.post('/users/lists/favorite', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiUsersListsFavorite(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/users/lists/unfavorite', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiUsersListsUnfavorite(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/users/lists/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');

			return jsonResponse(c, await handleHonoApiUsersListsCreate(deps, auth.user, body));
		});
	});

	app.post('/users/lists/create-from-public', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');

			return jsonResponse(c, await handleHonoApiUsersListsCreateFromPublic(deps, auth.user, body));
		});
	});

	app.post('/users/lists/pull', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiUsersListsPull(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/users/lists/push', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');
			await assertHonoApiRateLimitForUser(deps, 'users/lists/push', {
				duration: 60 * 60 * 1000,
				max: 30,
			}, auth.user);

			await handleHonoApiUsersListsPush(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/users/lists/get-memberships', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiUsersListsGetMemberships(deps, auth.user, body));
		});
	});

	app.post('/users/lists/update-membership', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiUsersListsUpdateMembership(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/username/available', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiUsernameAvailable(deps, body));
		});
	});

	app.post('/verify-email', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			await authenticateOptionalRequest(deps, c, body);

			await handleHonoApiVerifyEmail(deps, body);
			return emptyResponse(c);
		});
	});
}
