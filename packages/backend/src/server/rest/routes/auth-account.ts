/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { listActiveInstanceHostsFromDatabase } from '@/core/InstanceStore.js';
import { assertCredential, assertProhibitMoved, assertTokenPermission, authenticateHonoApiToken } from '../auth.js';
import { handleHonoApiAntennasCreate, handleHonoApiAntennasDelete, handleHonoApiAntennasList, handleHonoApiAntennasNotes, handleHonoApiAntennasRemoveNote, handleHonoApiAntennasShow, handleHonoApiAntennasUpdate } from '../antennas.js';
import { handleHonoApiAppCreate, handleHonoApiAppShow } from '../app.js';
import { handleHonoApiSigninFlow } from '../signin.js';
import { handleHonoApiSigninWithPasskey } from '../signin-with-passkey.js';
import { signupPendingWithHonoApi, signupWithHonoApi } from '../signup.js';
import { assertHonoApiRateLimit, type HonoApiEndpointRateLimit } from '../rate-limit.js';
import { jsonResponse, emptyResponse, signinFlowResponse, signinWithPasskeyResponse, jsonBody, tokenFromRequest, getRequestIp, runApiEndpoint, authenticateOptionalRequest } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';

export function registerAuthAccountRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.get('/v1/instance/peers', async (c) => {
		return jsonResponse(c, await listActiveInstanceHostsFromDatabase(deps.db));
	});

	app.post('/signup', async (c) => {
		return await runApiEndpoint(c, async () => {
			const limitation = getSignupRateLimit(deps.meta);
			if (limitation != null) {
				await assertHonoApiRateLimit(deps, 'signup', limitation, getRequestIp(c, deps.config));
			}
			const body = await jsonBody(c);
			return jsonResponse(c, await signupWithHonoApi(deps, body ?? {}));
		});
	});

	app.post('/signup-pending', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return signinFlowResponse(c, deps, await signupPendingWithHonoApi(deps, {
				body,
				headers: c.req.raw.headers,
				ip: getRequestIp(c, deps.config),
			}));
		});
	});

	app.post('/signin-flow', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return signinFlowResponse(c, deps, await handleHonoApiSigninFlow(deps, {
				body,
				headers: c.req.raw.headers,
				ip: getRequestIp(c, deps.config),
			}));
		});
	});

	app.post('/signin-with-passkey', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return signinWithPasskeyResponse(c, deps, await handleHonoApiSigninWithPasskey(deps, {
				body,
				headers: c.req.raw.headers,
				ip: getRequestIp(c, deps.config),
			}));
		});
	});

	app.post('/antennas/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');

			return jsonResponse(c, await handleHonoApiAntennasCreate(deps, auth.user, body));
		});
	});

	app.post('/antennas/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');

			return jsonResponse(c, await handleHonoApiAntennasUpdate(deps, auth.user, body));
		});
	});

	app.post('/antennas/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiAntennasDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/antennas/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiAntennasList(deps, auth.user, body));
		});
	});

	app.post('/antennas/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiAntennasShow(deps, auth.user, body));
		});
	});

	app.post('/antennas/remove-note', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiAntennasRemoveNote(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/antennas/notes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiAntennasNotes(deps, auth.user, body));
		});
	});

	app.post('/app/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiAppCreate(deps, auth.user, body));
		});
	});

	app.post('/app/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiAppShow(deps, auth.user, auth.user != null && auth.token == null, body));
		});
	});
}

export function getSignupRateLimit(meta: ApiShellDependencies['meta']): HonoApiEndpointRateLimit | null {
	const minInterval = meta.signupRateLimitMinIntervalSeconds > 0
		? meta.signupRateLimitMinIntervalSeconds * 1000
		: undefined;
	const max = meta.signupRateLimitMaxPerHour > 0 ? meta.signupRateLimitMaxPerHour : undefined;

	if (minInterval == null && max == null) return null;

	return {
		...(minInterval === undefined ? {} : { minInterval }),
		...(max === undefined ? {} : { duration: 60 * 60 * 1000, max }),
	};
}
