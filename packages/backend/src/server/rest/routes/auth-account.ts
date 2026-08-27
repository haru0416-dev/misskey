/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { listActiveInstanceHostsFromDatabase } from '@/core/instance/InstanceStore.js';
import { assertCredential, assertProhibitMoved, assertTokenPermission, authenticateApiToken } from '../auth/auth.js';
import {
	handleApiAntennasCreate,
	handleApiAntennasDelete,
	handleApiAntennasList,
	handleApiAntennasNotes,
	handleApiAntennasRemoveNote,
	handleApiAntennasShow,
	handleApiAntennasUpdate,
} from '../antenna/antennas.js';
import { handleApiAppCreate, handleApiAppShow } from '../auth/app.js';
import { handleApiSigninFlow } from '../auth/signin.js';
import { handleApiSigninWithPasskey } from '../auth/signin-with-passkey.js';
import { signupPendingWithApi, signupWithApi } from '../auth/signup.js';
import { assertApiRateLimit, type ApiEndpointRateLimit } from '../rate-limit.js';
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
				await assertApiRateLimit(deps, 'signup', limitation, getRequestIp(c, deps.config));
			}
			const body = await jsonBody(c);
			return jsonResponse(c, await signupWithApi(deps, body ?? {}));
		});
	});

	app.post('/signup-pending', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return signinFlowResponse(
				c,
				deps,
				await signupPendingWithApi(deps, {
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
				await handleApiSigninFlow(deps, {
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
				await handleApiSigninWithPasskey(deps, {
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
			jsonResponse(c, await handleApiAntennasCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/antennas/update',
		endpointHandler(deps, 'antennas/update', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAntennasUpdate(deps, auth.user, body)),
		),
	);

	app.post(
		'/antennas/delete',
		endpointHandler(deps, 'antennas/delete', async ({ body, auth, c }) => {
			await handleApiAntennasDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/antennas/list',
		endpointHandler(deps, 'antennas/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAntennasList(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/antennas/show',
		endpointHandler(deps, 'antennas/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAntennasShow(deps, auth.user, body)),
		),
	);

	app.post(
		'/antennas/remove-note',
		endpointHandler(deps, 'antennas/remove-note', async ({ body, auth, c }) => {
			await handleApiAntennasRemoveNote(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/antennas/notes',
		endpointHandler(deps, 'antennas/notes', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAntennasNotes(deps, auth.user, body)),
		),
	);

	app.post(
		'/app/create',
		endpointHandlerAnonymous(deps, 'app/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAppCreate(deps, auth.user, body)),
		),
	);

	app.on(['POST', 'QUERY'], '/app/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleApiAppShow(deps, auth.user, auth.user != null && auth.token == null, body));
		});
	});
}

export function getSignupRateLimit(meta: ApiShellDependencies['meta']): ApiEndpointRateLimit | null {
	const minInterval =
		meta.signupRateLimitMinIntervalSeconds > 0 ? meta.signupRateLimitMinIntervalSeconds * 1000 : undefined;
	const max = meta.signupRateLimitMaxPerHour > 0 ? meta.signupRateLimitMaxPerHour : undefined;

	if (minInterval == null && max == null) return null;

	return {
		...(minInterval === undefined ? {} : { minInterval }),
		...(max === undefined ? {} : { duration: 60 * 60 * 1000, max }),
	};
}
