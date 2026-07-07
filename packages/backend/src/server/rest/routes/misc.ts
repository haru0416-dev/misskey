/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertProhibitMoved, assertSecureCredential, assertTokenPermission, authenticateHonoApiToken } from '../auth.js';
import { handleHonoApiGetAvatarDecorations } from '../avatar-decorations.js';
import { handleHonoApiGetOnlineUsersCount } from '../availability.js';
import { handleHonoApiPagesLike, handleHonoApiPagesUnlike } from '../favorites.js';
import { handleHonoApiMeta, handleHonoApiPing, handleHonoApiServerInfo, handleHonoApiTest } from '../meta.js';
import { handleHonoApiPagesCreate, handleHonoApiPagesDelete, handleHonoApiPagesFeatured, handleHonoApiPagesShow, handleHonoApiPagesUpdate } from '../pages.js';
import { handleHonoApiRequestResetPassword, handleHonoApiResetPassword } from '../password-reset.js';
import { handleHonoApiPromoRead } from '../promo.js';
import { assertHonoApiRateLimitForUser } from '../rate-limit.js';
import { handleHonoApiResetDb } from '../reset-db.js';
import { handleHonoApiRetention } from '../retention.js';
import { handleHonoApiRolesList, handleHonoApiRolesNotes, handleHonoApiRolesShow, handleHonoApiRolesUsers } from '../roles.js';
import { handleHonoApiSwRegister, handleHonoApiSwShowRegistration, handleHonoApiSwUnregister, handleHonoApiSwUpdateRegistration } from '../sw.js';
import { jsonResponse, emptyResponse, jsonBody, tokenFromRequest, getRequestIp, runApiEndpoint, authenticateOptionalRequest } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';

export function registerMiscRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post('/meta', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiMeta(deps, body));
		});
	});

	app.post('/pages/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:pages');
			await assertHonoApiRateLimitForUser(deps, 'pages/create', {
				duration: 60 * 60 * 1000,
				max: 10,
			}, auth.user);

			return jsonResponse(c, await handleHonoApiPagesCreate(deps, auth.user, body));
		});
	});

	app.post('/pages/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:pages');
			await assertHonoApiRateLimitForUser(deps, 'pages/update', {
				duration: 60 * 60 * 1000,
				max: 300,
			}, auth.user);

			await handleHonoApiPagesUpdate(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/pages/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:pages');

			await handleHonoApiPagesDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/pages/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiPagesShow(deps, auth.user, body));
		});
	});

	app.post('/pages/featured', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiPagesFeatured(deps, auth.user, body));
		});
	});

	app.post('/pages/like', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:page-likes');

			await handleHonoApiPagesLike(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/pages/unlike', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:page-likes');

			await handleHonoApiPagesUnlike(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/ping', async (c) => {
		return await runApiEndpoint(c, async () => {
			await jsonBody(c);
			return jsonResponse(c, handleHonoApiPing());
		});
	});

	app.post('/promo/read', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiPromoRead(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.get('/retention', async (c) => {
		return await runApiEndpoint(c, async () => {
			return jsonResponse(c, await handleHonoApiRetention(deps, {}), 200, {
				'Cache-Control': 'public, max-age=3600',
			});
		});
	});

	app.post('/retention', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiRetention(deps, body), 200, {
				'Cache-Control': 'public, max-age=3600',
			});
		});
	});

	app.post('/request-reset-password', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			await handleHonoApiRequestResetPassword(deps, body, getRequestIp(c, deps.config));
			return emptyResponse(c);
		});
	});

	app.post('/reset-password', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			await handleHonoApiResetPassword(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/reset-db', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			await handleHonoApiResetDb(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/roles/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiRolesList(deps, body));
		});
	});

	app.post('/roles/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiRolesShow(deps, body));
		});
	});

	app.post('/roles/users', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiRolesUsers(deps, auth.user, body));
		});
	});

	app.post('/roles/notes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiRolesNotes(deps, auth.user, body));
		});
	});

	app.get('/server-info', async (c) => {
		return await runApiEndpoint(c, async () => {
			return jsonResponse(c, await handleHonoApiServerInfo(deps.meta), 200, {
				'Cache-Control': 'public, max-age=60',
			});
		});
	});

	app.post('/server-info', async (c) => {
		return await runApiEndpoint(c, async () => {
			await jsonBody(c);
			return jsonResponse(c, await handleHonoApiServerInfo(deps.meta), 200, {
				'Cache-Control': 'public, max-age=60',
			});
		});
	});

	app.post('/sw/register', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			return jsonResponse(c, await handleHonoApiSwRegister(deps, auth.user, body));
		});
	});

	app.post('/sw/show-registration', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			return jsonResponse(c, await handleHonoApiSwShowRegistration(deps, auth.user, body));
		});
	});

	app.post('/sw/unregister', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			await handleHonoApiSwUnregister(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/sw/update-registration', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			return jsonResponse(c, await handleHonoApiSwUpdateRegistration(deps, auth.user, body));
		});
	});

	app.post('/test', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, handleHonoApiTest(body));
		});
	});

	app.get('/get-online-users-count', async (c) => {
		return await runApiEndpoint(c, async () => {
			return jsonResponse(c, await handleHonoApiGetOnlineUsersCount(deps), 200, {
				'Cache-Control': 'public, max-age=60',
			});
		});
	});

	app.post('/get-online-users-count', async (c) => {
		return await runApiEndpoint(c, async () => {
			await jsonBody(c);
			return jsonResponse(c, await handleHonoApiGetOnlineUsersCount(deps), 200, {
				'Cache-Control': 'public, max-age=60',
			});
		});
	});

	app.post('/get-avatar-decorations', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiGetAvatarDecorations(deps, body));
		});
	});
}
