/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { listActiveInstanceHostsFromDatabase } from '@/core/instance/InstanceStore.js';
import {
	assertCredential,
	assertProhibitMoved,
	assertTokenPermission,
	authenticateHonoApiToken,
} from '../auth/auth.js';
import {
	handleHonoApiAntennasCreate,
	handleHonoApiAntennasDelete,
	handleHonoApiAntennasList,
	handleHonoApiAntennasNotes,
	handleHonoApiAntennasRemoveNote,
	handleHonoApiAntennasShow,
	handleHonoApiAntennasUpdate,
} from '../antenna/antennas.js';
import { handleHonoApiAppCreate, handleHonoApiAppShow } from '../auth/app.js';
import { handleHonoApiSigninFlow } from '../auth/signin.js';
import { handleHonoApiSigninWithPasskey } from '../auth/signin-with-passkey.js';
import { signupPendingWithHonoApi, signupWithHonoApi } from '../auth/signup.js';
import { assertHonoApiRateLimit, type HonoApiEndpointRateLimit } from '../rate-limit.js';
import {
	jsonResponse,
	emptyResponse,
	signinFlowResponse,
	signinWithPasskeyResponse,
	jsonBody,
	tokenFromRequest,
	getRequestIp,
	runApiEndpoint,
	authenticateOptionalRequest,
} from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandler, endpointHandlerAnonymous } from '../endpoint-handlers.js';

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
			return signinFlowResponse(
				c,
				deps,
				await signupPendingWithHonoApi(deps, {
					body,
					headers: c.req.raw.headers,
					ip: getRequestIp(c, deps.config),
				}),
			);
		});
	});

	app.post('/signin-flow', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return signinFlowResponse(
				c,
				deps,
				await handleHonoApiSigninFlow(deps, {
					body,
					headers: c.req.raw.headers,
					ip: getRequestIp(c, deps.config),
				}),
			);
		});
	});

	app.post('/signin-with-passkey', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return signinWithPasskeyResponse(
				c,
				deps,
				await handleHonoApiSigninWithPasskey(deps, {
					body,
					headers: c.req.raw.headers,
					ip: getRequestIp(c, deps.config),
				}),
			);
		});
	});

	app.post(
		'/antennas/create',
		endpointHandler(deps, 'antennas/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAntennasCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/antennas/update',
		endpointHandler(deps, 'antennas/update', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAntennasUpdate(deps, auth.user, body)),
		),
	);

	app.post(
		'/antennas/delete',
		endpointHandler(deps, 'antennas/delete', async ({ body, auth, c }) => {
			await handleHonoApiAntennasDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/antennas/list',
		endpointHandler(deps, 'antennas/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAntennasList(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/antennas/show',
		endpointHandler(deps, 'antennas/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAntennasShow(deps, auth.user, body)),
		),
	);

	app.post(
		'/antennas/remove-note',
		endpointHandler(deps, 'antennas/remove-note', async ({ body, auth, c }) => {
			await handleHonoApiAntennasRemoveNote(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/antennas/notes',
		endpointHandler(deps, 'antennas/notes', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAntennasNotes(deps, auth.user, body)),
		),
	);

	app.post(
		'/app/create',
		endpointHandlerAnonymous(deps, 'app/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAppCreate(deps, auth.user, body)),
		),
	);

	app.on(['POST', 'QUERY'], '/app/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(
				c,
				await handleHonoApiAppShow(deps, auth.user, auth.user != null && auth.token == null, body),
			);
		});
	});
}

export function getSignupRateLimit(meta: ApiShellDependencies['meta']): HonoApiEndpointRateLimit | null {
	const minInterval =
		meta.signupRateLimitMinIntervalSeconds > 0 ? meta.signupRateLimitMinIntervalSeconds * 1000 : undefined;
	const max = meta.signupRateLimitMaxPerHour > 0 ? meta.signupRateLimitMaxPerHour : undefined;

	if (minInterval == null && max == null) return null;

	return {
		...(minInterval === undefined ? {} : { minInterval }),
		...(max === undefined ? {} : { duration: 60 * 60 * 1000, max }),
	};
}
