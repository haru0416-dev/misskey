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
import {
	handleHonoApiAuthAccept,
	handleHonoApiAuthSessionGenerate,
	handleHonoApiAuthSessionShow,
	handleHonoApiAuthSessionUserkey,
} from '../auth-session.js';
import {
	handleHonoApiBlockingCreate,
	handleHonoApiBlockingDelete,
	handleHonoApiBlockingList,
} from '../account-blocking.js';
import {
	handleHonoApiMuteCreate,
	handleHonoApiMuteDelete,
	handleHonoApiMuteList,
	handleHonoApiRenoteMuteCreate,
	handleHonoApiRenoteMuteDelete,
	handleHonoApiRenoteMuteList,
} from '../account-mutes.js';
import { assertHonoApiRateLimitForUser } from '../rate-limit.js';
import {
	jsonResponse,
	emptyResponse,
	jsonBody,
	tokenFromRequest,
	runApiEndpoint,
	authenticateOptionalRequest,
} from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';

export function registerAuthSessionMutesRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post('/auth/session/generate', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiAuthSessionGenerate(deps, body));
		});
	});

	app.on(['POST', 'QUERY'], '/auth/session/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiAuthSessionShow(deps, auth.user, body));
		});
	});

	app.post('/auth/session/userkey', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiAuthSessionUserkey(deps, body));
		});
	});

	app.post('/auth/accept', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			await handleHonoApiAuthAccept(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/blocking/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:blocks');
			await assertHonoApiRateLimitForUser(
				deps,
				'blocking/create',
				{
					duration: 60 * 60 * 1000,
					max: 20,
				},
				auth.user,
			);

			return jsonResponse(c, await handleHonoApiBlockingCreate(deps, auth.user, body));
		});
	});

	app.post('/blocking/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:blocks');
			await assertHonoApiRateLimitForUser(
				deps,
				'blocking/delete',
				{
					duration: 60 * 60 * 1000,
					max: 100,
				},
				auth.user,
			);

			return jsonResponse(c, await handleHonoApiBlockingDelete(deps, auth.user, body));
		});
	});

	app.on(['POST', 'QUERY'], '/blocking/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:blocks');

			return jsonResponse(c, await handleHonoApiBlockingList(deps, auth.user, body));
		});
	});

	app.post('/mute/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:mutes');
			await assertHonoApiRateLimitForUser(
				deps,
				'mute/create',
				{
					duration: 60 * 60 * 1000,
					max: 20,
				},
				auth.user,
			);

			await handleHonoApiMuteCreate(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/mute/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:mutes');

			await handleHonoApiMuteDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.on(['POST', 'QUERY'], '/mute/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:mutes');

			return jsonResponse(c, await handleHonoApiMuteList(deps, auth.user, body));
		});
	});

	app.post('/renote-mute/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:mutes');
			await assertHonoApiRateLimitForUser(
				deps,
				'renote-mute/create',
				{
					duration: 60 * 60 * 1000,
					max: 20,
				},
				auth.user,
			);

			await handleHonoApiRenoteMuteCreate(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/renote-mute/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:mutes');

			await handleHonoApiRenoteMuteDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.on(['POST', 'QUERY'], '/renote-mute/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:mutes');

			return jsonResponse(c, await handleHonoApiRenoteMuteList(deps, auth.user, body));
		});
	});
}
