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
import { handleApiEmailAddressAvailable } from '../auth/availability.js';
import { handleApiPinnedUsers } from '../user/user.js';
import {
	handleApiAnnouncementReact,
	handleApiAnnouncements,
	handleApiAnnouncementShow,
	handleApiAnnouncementUnreact,
	handleApiIReadAnnouncement,
} from '../announcement/announcements.js';
import { handleApiIClaimAchievement } from '../notification/notification.js';
import { handleApiPagePush } from '../page/page-push.js';
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
			jsonResponse(c, await handleApiAnnouncements(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/announcements/show',
		endpointHandlerAnonymous(deps, 'announcements/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAnnouncementShow(deps, auth.user, body)),
		),
	);

	app.post(
		'/announcements/react',
		endpointHandler(deps, 'announcements/react', async ({ body, auth, c }) => {
			await handleApiAnnouncementReact(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/announcements/unreact',
		endpointHandler(deps, 'announcements/unreact', async ({ body, auth, c }) => {
			await handleApiAnnouncementUnreact(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/i/read-announcement',
		endpointHandler(deps, 'i/read-announcement', async ({ body, auth, c }) => {
			await handleApiIReadAnnouncement(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/i/claim-achievement',
		endpointHandler(deps, 'i/claim-achievement', async ({ body, auth, c }) => {
			await handleApiIClaimAchievement(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/pinned-users',
		endpointHandlerAnonymous(deps, 'pinned-users', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiPinnedUsers(deps, auth.user, body)),
		),
	);

	app.post(
		'/page-push',
		endpointHandler(deps, 'page-push', async ({ body, auth, c }) => {
			await handleApiPagePush(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/email-address/available',
		endpointHandlerAnonymous(deps, 'email-address/available', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiEmailAddressAvailable(deps, body)),
		),
	);
}
