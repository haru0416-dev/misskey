/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertProhibitMoved, assertSecureCredential, authenticateHonoApiToken } from '../auth.js';
import { rolePermissionDeniedError } from '../error.js';
import {
	handleHonoApiExportCustomEmojis,
	handleHonoApiIExportAntennas,
	handleHonoApiIExportBlocking,
	handleHonoApiIExportClips,
	handleHonoApiIExportFavorites,
	handleHonoApiIExportFollowing,
	handleHonoApiIExportMute,
	handleHonoApiIExportNotes,
	handleHonoApiIExportUserLists,
} from '../export-jobs.js';
import {
	handleHonoApiIImportAntennas,
	handleHonoApiIImportBlocking,
	handleHonoApiIImportFollowing,
	handleHonoApiIImportMuting,
	handleHonoApiIImportUserLists,
} from '../import-jobs.js';
import { handleHonoApiFetchRss } from '../fetch-rss.js';
import { assertHonoApiRateLimit, assertHonoApiRateLimitForUser } from '../rate-limit.js';
import { hasHonoApiRolePolicyOrIsRoot } from '../role-policy.js';
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
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiRateLimitForUser(
				deps,
				'export-custom-emojis',
				{
					duration: 60 * 60 * 1000,
					max: 1,
				},
				auth.user,
			);

			handleHonoApiExportCustomEmojis(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/i/export-notes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiRateLimitForUser(
				deps,
				'i/export-notes',
				{
					duration: 24 * 60 * 60 * 1000,
					max: 1,
				},
				auth.user,
			);

			handleHonoApiIExportNotes(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/i/export-clips', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiRateLimitForUser(
				deps,
				'i/export-clips',
				{
					duration: 24 * 60 * 60 * 1000,
					max: 1,
				},
				auth.user,
			);

			handleHonoApiIExportClips(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/i/export-favorites', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiRateLimitForUser(
				deps,
				'i/export-favorites',
				{
					duration: 24 * 60 * 60 * 1000,
					max: 1,
				},
				auth.user,
			);

			handleHonoApiIExportFavorites(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/i/export-following', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiRateLimitForUser(
				deps,
				'i/export-following',
				{
					duration: 60 * 60 * 1000,
					max: 1,
				},
				auth.user,
			);

			handleHonoApiIExportFollowing(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/i/export-mute', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiRateLimitForUser(
				deps,
				'i/export-mute',
				{
					duration: 60 * 60 * 1000,
					max: 1,
				},
				auth.user,
			);

			handleHonoApiIExportMute(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/i/export-blocking', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiRateLimitForUser(
				deps,
				'i/export-blocking',
				{
					duration: 60 * 60 * 1000,
					max: 1,
				},
				auth.user,
			);

			handleHonoApiIExportBlocking(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/i/export-user-lists', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiRateLimitForUser(
				deps,
				'i/export-user-lists',
				{
					duration: 60 * 1000,
					max: 1,
				},
				auth.user,
			);

			handleHonoApiIExportUserLists(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/i/import-blocking', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			assertProhibitMoved(auth.user);
			if (!(await hasHonoApiRolePolicyOrIsRoot(deps, auth.user, 'canImportBlocking'))) {
				throw rolePermissionDeniedError();
			}
			await assertHonoApiRateLimitForUser(
				deps,
				'i/import-blocking',
				{
					duration: 60 * 60 * 1000,
					max: 1,
				},
				auth.user,
			);

			await handleHonoApiIImportBlocking(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/i/import-following', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			assertProhibitMoved(auth.user);
			if (!(await hasHonoApiRolePolicyOrIsRoot(deps, auth.user, 'canImportFollowing'))) {
				throw rolePermissionDeniedError();
			}
			await assertHonoApiRateLimitForUser(
				deps,
				'i/import-following',
				{
					duration: 60 * 60 * 1000,
					max: 1,
				},
				auth.user,
			);

			await handleHonoApiIImportFollowing(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/i/import-muting', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			assertProhibitMoved(auth.user);
			if (!(await hasHonoApiRolePolicyOrIsRoot(deps, auth.user, 'canImportMuting'))) {
				throw rolePermissionDeniedError();
			}
			await assertHonoApiRateLimitForUser(
				deps,
				'i/import-muting',
				{
					duration: 60 * 60 * 1000,
					max: 1,
				},
				auth.user,
			);

			await handleHonoApiIImportMuting(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/i/import-user-lists', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			assertProhibitMoved(auth.user);
			if (!(await hasHonoApiRolePolicyOrIsRoot(deps, auth.user, 'canImportUserLists'))) {
				throw rolePermissionDeniedError();
			}
			await assertHonoApiRateLimitForUser(
				deps,
				'i/import-user-lists',
				{
					duration: 60 * 60 * 1000,
					max: 1,
				},
				auth.user,
			);

			await handleHonoApiIImportUserLists(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/i/import-antennas', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			assertProhibitMoved(auth.user);
			if (!(await hasHonoApiRolePolicyOrIsRoot(deps, auth.user, 'canImportAntennas'))) {
				throw rolePermissionDeniedError();
			}
			// 連打自体はここで抑え、時間あたりの実行枠はファイル検証を通ってから消費する
			// (壊れたファイル1回で1時間ロックアウトされないように)。
			await assertHonoApiRateLimitForUser(
				deps,
				'i/import-antennas',
				{
					key: 'i/import-antennas:attempt',
					minInterval: 5 * 1000,
				},
				auth.user,
			);

			await handleHonoApiIImportAntennas(deps, auth.user, body, () =>
				assertHonoApiRateLimitForUser(
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
		});
	});

	app.post('/i/export-antennas', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiRateLimitForUser(
				deps,
				'i/export-antennas',
				{
					duration: 60 * 60 * 1000,
					max: 1,
				},
				auth.user,
			);

			handleHonoApiIExportAntennas(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.get('/fetch-rss', async (c) => {
		return await runApiEndpoint(c, async () => {
			await assertHonoApiRateLimit(deps, 'fetch-rss', { duration: 60 * 1000, max: 30 }, getRequestIp(c, deps.config));
			return jsonResponse(c, await handleHonoApiFetchRss(deps, c.req.query()), 200, {
				'Cache-Control': 'public, max-age=180',
			});
		});
	});

	app.post('/fetch-rss', async (c) => {
		return await runApiEndpoint(c, async () => {
			await assertHonoApiRateLimit(deps, 'fetch-rss', { duration: 60 * 1000, max: 30 }, getRequestIp(c, deps.config));
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiFetchRss(deps, body), 200, {
				'Cache-Control': 'public, max-age=180',
			});
		});
	});
}
