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
import { handleHonoApiEmailAddressAvailable } from '../availability.js';
import { handleHonoApiPinnedUsers } from '../user.js';
import {
	handleHonoApiAnnouncements,
	handleHonoApiAnnouncementShow,
	handleHonoApiIReadAnnouncement,
} from '../announcements.js';
import { handleHonoApiIClaimAchievement } from '../notification.js';
import { handleHonoApiPagePush } from '../page-push.js';
import {
	jsonResponse,
	emptyResponse,
	jsonBody,
	tokenFromRequest,
	runApiEndpoint,
	authenticateOptionalRequest,
} from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';

export function registerAnnouncementsRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post('/announcements', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiAnnouncements(deps, auth.user, body));
		});
	});

	app.on(['POST', 'QUERY'], '/announcements/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiAnnouncementShow(deps, auth.user, body));
		});
	});

	app.post('/i/read-announcement', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiIReadAnnouncement(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/i/claim-achievement', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiIClaimAchievement(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.on(['POST', 'QUERY'], '/pinned-users', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiPinnedUsers(deps, auth.user, body));
		});
	});

	app.post('/page-push', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			await handleHonoApiPagePush(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.on(['POST', 'QUERY'], '/email-address/available', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiEmailAddressAvailable(deps, body));
		});
	});
}
