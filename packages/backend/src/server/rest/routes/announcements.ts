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
} from '../auth/auth.js';
import { handleHonoApiEmailAddressAvailable } from '../auth/availability.js';
import { handleHonoApiPinnedUsers } from '../user/user.js';
import {
	handleHonoApiAnnouncements,
	handleHonoApiAnnouncementShow,
	handleHonoApiIReadAnnouncement,
} from '../announcement/announcements.js';
import { handleHonoApiIClaimAchievement } from '../notification/notification.js';
import { handleHonoApiPagePush } from '../page/page-push.js';
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

export function registerAnnouncementsRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post(
		'/announcements',
		endpointHandlerAnonymous(deps, 'announcements', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAnnouncements(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/announcements/show',
		endpointHandlerAnonymous(deps, 'announcements/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAnnouncementShow(deps, auth.user, body)),
		),
	);

	app.post(
		'/i/read-announcement',
		endpointHandler(deps, 'i/read-announcement', async ({ body, auth, c }) => {
			await handleHonoApiIReadAnnouncement(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/i/claim-achievement',
		endpointHandler(deps, 'i/claim-achievement', async ({ body, auth, c }) => {
			await handleHonoApiIClaimAchievement(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/pinned-users',
		endpointHandlerAnonymous(deps, 'pinned-users', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiPinnedUsers(deps, auth.user, body)),
		),
	);

	app.post(
		'/page-push',
		endpointHandler(deps, 'page-push', async ({ body, auth, c }) => {
			await handleHonoApiPagePush(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/email-address/available',
		endpointHandlerAnonymous(deps, 'email-address/available', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiEmailAddressAvailable(deps, body)),
		),
	);
}
