/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertProhibitMoved, assertTokenPermission, authenticateHonoApiToken } from '../auth.js';
import { handleHonoApiClipsFavorite, handleHonoApiClipsUnfavorite } from '../favorites.js';
import { handleHonoApiClipsAddNote, handleHonoApiClipsCreate, handleHonoApiClipsDelete, handleHonoApiClipsList, handleHonoApiClipsMyFavorites, handleHonoApiClipsNotes, handleHonoApiClipsRemoveNote, handleHonoApiClipsShow, handleHonoApiClipsUpdate } from '../clips.js';
import { assertHonoApiRateLimitForUser } from '../rate-limit.js';
import { jsonResponse, emptyResponse, jsonBody, tokenFromRequest, runApiEndpoint, authenticateOptionalRequest } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';

export function registerClipsRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post('/clips/favorite', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:clip-favorite');

			await handleHonoApiClipsFavorite(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/clips/unfavorite', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:clip-favorite');

			await handleHonoApiClipsUnfavorite(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/clips/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiClipsList(deps, auth.user, body));
		});
	});

	app.post('/clips/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiClipsShow(deps, auth.user, body));
		});
	});

	app.post('/clips/my-favorites', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:clip-favorite');

			return jsonResponse(c, await handleHonoApiClipsMyFavorites(deps, auth.user, body));
		});
	});

	app.post('/clips/notes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiClipsNotes(deps, auth.user, body));
		});
	});

	app.post('/clips/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');

			return jsonResponse(c, await handleHonoApiClipsCreate(deps, auth.user, body));
		});
	});

	app.post('/clips/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');

			return jsonResponse(c, await handleHonoApiClipsUpdate(deps, auth.user, body));
		});
	});

	app.post('/clips/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiClipsDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/clips/add-note', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');
			await assertHonoApiRateLimitForUser(deps, 'clips/add-note', {
				duration: 60 * 60 * 1000,
				max: 20,
			}, auth.user);

			await handleHonoApiClipsAddNote(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/clips/remove-note', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiClipsRemoveNote(deps, auth.user, body);
			return emptyResponse(c);
		});
	});
}
