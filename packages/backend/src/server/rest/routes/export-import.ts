/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertProhibitMoved, assertSecureCredential, authenticateApiToken } from '../auth/auth.js';
import { rolePermissionDeniedError } from '../error.js';
import {
	handleApiExportCustomEmojis,
	handleApiIExportAntennas,
	handleApiIExportBlocking,
	handleApiIExportClips,
	handleApiIExportFavorites,
	handleApiIExportFollowing,
	handleApiIExportMute,
	handleApiIExportNotes,
	handleApiIExportUserLists,
} from '../job/export-jobs.js';
import {
	handleApiIImportAntennas,
	handleApiIImportBlocking,
	handleApiIImportFollowing,
	handleApiIImportMuting,
	handleApiIImportUserLists,
} from '../job/import-jobs.js';
import { handleApiFetchRss } from '../feed/fetch-rss.js';
import { assertApiRateLimit, assertApiRateLimitForUser } from '../rate-limit.js';
import { hasApiRolePolicyOrIsRoot } from '../role/role-policy.js';
import {
	jsonResponse,
	emptyResponse,
	getRequestIp,
	jsonBody,
	tokenFromRequest,
	runApiEndpoint,
} from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandler } from '../endpoint-handlers.js';

export function registerExportImportRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post('/export-custom-emojis', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertApiRateLimitForUser(
				deps,
				'export-custom-emojis',
				{
					duration: 60 * 60 * 1000,
					max: 1,
				},
				auth.user,
			);

			handleApiExportCustomEmojis(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/i/export-notes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertApiRateLimitForUser(
				deps,
				'i/export-notes',
				{
					duration: 24 * 60 * 60 * 1000,
					max: 1,
				},
				auth.user,
			);

			handleApiIExportNotes(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/i/export-clips', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertApiRateLimitForUser(
				deps,
				'i/export-clips',
				{
					duration: 24 * 60 * 60 * 1000,
					max: 1,
				},
				auth.user,
			);

			handleApiIExportClips(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/i/export-favorites', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertApiRateLimitForUser(
				deps,
				'i/export-favorites',
				{
					duration: 24 * 60 * 60 * 1000,
					max: 1,
				},
				auth.user,
			);

			handleApiIExportFavorites(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/i/export-following', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertApiRateLimitForUser(
				deps,
				'i/export-following',
				{
					duration: 60 * 60 * 1000,
					max: 1,
				},
				auth.user,
			);

			handleApiIExportFollowing(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/i/export-mute', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertApiRateLimitForUser(
				deps,
				'i/export-mute',
				{
					duration: 60 * 60 * 1000,
					max: 1,
				},
				auth.user,
			);

			handleApiIExportMute(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/i/export-blocking', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertApiRateLimitForUser(
				deps,
				'i/export-blocking',
				{
					duration: 60 * 60 * 1000,
					max: 1,
				},
				auth.user,
			);

			handleApiIExportBlocking(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/i/export-user-lists', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertApiRateLimitForUser(
				deps,
				'i/export-user-lists',
				{
					duration: 60 * 1000,
					max: 1,
				},
				auth.user,
			);

			handleApiIExportUserLists(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post(
		'/i/import-blocking',
		endpointHandler(deps, 'i/import-blocking', async ({ body, auth, c }) => {
			await handleApiIImportBlocking(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/i/import-following',
		endpointHandler(deps, 'i/import-following', async ({ body, auth, c }) => {
			await handleApiIImportFollowing(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/i/import-muting',
		endpointHandler(deps, 'i/import-muting', async ({ body, auth, c }) => {
			await handleApiIImportMuting(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/i/import-user-lists',
		endpointHandler(deps, 'i/import-user-lists', async ({ body, auth, c }) => {
			await handleApiIImportUserLists(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/i/import-antennas',
		endpointHandler(deps, 'i/import-antennas', async ({ body, auth, c }) => {
			await handleApiIImportAntennas(deps, auth.user, body, () =>
				assertApiRateLimitForUser(
					deps,
					'i/import-antennas',
					{
						duration: 60 * 60 * 1000,
						max: 1,
					},
					auth.user,
				),
			);
			return emptyResponse(c);
		}),
	);

	app.post('/i/export-antennas', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertApiRateLimitForUser(
				deps,
				'i/export-antennas',
				{
					duration: 60 * 60 * 1000,
					max: 1,
				},
				auth.user,
			);

			handleApiIExportAntennas(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.get('/fetch-rss', async (c) => {
		return await runApiEndpoint(c, async () => {
			await assertApiRateLimit(deps, 'fetch-rss', { duration: 60 * 1000, max: 30 }, getRequestIp(c, deps.config));
			return jsonResponse(c, await handleApiFetchRss(deps, c.req.query()), 200, {
				'Cache-Control': 'public, max-age=180',
			});
		});
	});

	app.post('/fetch-rss', async (c) => {
		return await runApiEndpoint(c, async () => {
			await assertApiRateLimit(deps, 'fetch-rss', { duration: 60 * 1000, max: 30 }, getRequestIp(c, deps.config));
			const body = await jsonBody(c);
			return jsonResponse(c, await handleApiFetchRss(deps, body), 200, {
				'Cache-Control': 'public, max-age=180',
			});
		});
	});
}
