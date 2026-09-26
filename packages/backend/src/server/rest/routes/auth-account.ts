/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { listActiveInstanceHostsFromDatabase } from '@/core/instance/InstanceStore.js';
import { handleApiSigninFlow } from '../auth/signin.js';
import { handleApiSigninWithPasskey } from '../auth/signin-with-passkey.js';
import { signupPendingWithApi, signupWithApi } from '../auth/signup.js';
import { assertApiRateLimit } from '../rate-limit.js';
import type { ApiEndpointRateLimit } from '../rate-limit.js';
import {
	jsonResponse,
	signinFlowResponse,
	signinWithPasskeyResponse,
	jsonBody,
	getRequestIp,
	runApiEndpoint,
} from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';

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
}

export function getSignupRateLimit(meta: ApiShellDependencies['meta']): ApiEndpointRateLimit | null {
	const minInterval =
		meta.signupRateLimitMinIntervalSeconds > 0 ? meta.signupRateLimitMinIntervalSeconds * 1000 : undefined;
	const max = meta.signupRateLimitMaxPerHour > 0 ? meta.signupRateLimitMaxPerHour : undefined;

	if (minInterval == null && max == null) {
		return null;
	}

	return {
		...(minInterval === undefined ? {} : { minInterval }),
		...(max === undefined ? {} : { duration: 60 * 60 * 1000, max }),
	};
}
