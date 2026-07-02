/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Hono, type Context } from 'hono';
import type * as Redis from 'ioredis';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/_.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import type { UserAuthService } from '@/core/UserAuthService.js';
import type { WebAuthnService } from '@/core/WebAuthnService.js';
import type { EmailService } from '@/core/EmailService.js';
import type Logger from '@/logger.js';
import { listActiveInstanceHostsFromDatabase } from '@/core/InstanceStore.js';
import { assertCredential, assertOptionalCredential, assertSecureCredential, assertTokenPermission, authenticateHonoApiToken, type HonoApiAuthenticated } from './hono-api-auth.js';
import { handleHonoApiAppCreate, handleHonoApiAppShow, handleHonoApiMyApps } from './hono-api-app.js';
import { handleHonoApiAuthAccept, handleHonoApiAuthSessionGenerate, handleHonoApiAuthSessionShow, handleHonoApiAuthSessionUserkey } from './hono-api-auth-session.js';
import { HonoApiError, invalidJsonBody } from './hono-api-error.js';
import { handleHonoApiI } from './hono-api-i.js';
import { handleHonoApiMiauthCheck, handleHonoApiMiauthGenToken } from './hono-api-miauth.js';
import type { HonoApiMainStreamPublisher } from './hono-api-notification.js';
import { handleHonoApiSigninFlow, type HonoApiSigninFlowResult } from './hono-api-signin.js';
import { handleHonoApiSigninWithPasskey, type HonoApiSigninWithPasskeyResult } from './hono-api-signin-with-passkey.js';
import { signupPendingWithHonoApi, signupWithHonoApi, type SignupInternalEventPublisher } from './hono-api-signup.js';

export type ApiShellDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	redis: Redis.Redis;
	httpRequestService: HttpRequestService;
	userAuthService: Pick<UserAuthService, 'twoFactorAuthenticate'>;
	webAuthnService: Pick<WebAuthnService, 'initiateAuthentication' | 'verifyAuthentication' | 'initiateSignInWithPasskeyAuthentication' | 'verifySignInWithPasskeyAuthentication'>;
	emailService: Pick<EmailService, 'sendEmail'>;
	logger: Pick<Logger, 'debug' | 'error' | 'info' | 'warn'>;
	publishInternalEvent?: SignupInternalEventPublisher;
	publishMainStream?: HonoApiMainStreamPublisher;
};

const unknownApiEndpoint = {
	error: {
		message: 'Unknown API endpoint.',
		code: 'UNKNOWN_API_ENDPOINT',
		id: '2ca3b769-540a-4f08-9dd5-b5a825b6d0f1',
		kind: 'client',
	},
};

function setApiHeaders(c: Context): void {
	c.header('Access-Control-Allow-Origin', '*');
	c.header('Cache-Control', 'private, max-age=0, must-revalidate');
}

function jsonResponse(c: Context, body: unknown, status = 200): Response {
	setApiHeaders(c);
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'private, max-age=0, must-revalidate',
			'Content-Type': 'application/json; charset=utf-8',
		},
	});
}

function emptyResponse(c: Context): Response {
	setApiHeaders(c);
	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'private, max-age=0, must-revalidate',
		},
	});
}

function signinFlowResponse(c: Context, deps: ApiShellDependencies, result: HonoApiSigninFlowResult): Response {
	setApiHeaders(c);
	const headers: Record<string, string> = {
		'Access-Control-Allow-Origin': deps.config.url,
		'Access-Control-Allow-Credentials': 'true',
		'Cache-Control': 'private, max-age=0, must-revalidate',
	};

	if (result.body === undefined) {
		return new Response(null, {
			status: result.status,
			headers,
		});
	}

	return new Response(JSON.stringify(result.body), {
		status: result.status,
		headers: {
			...headers,
			'Content-Type': 'application/json; charset=utf-8',
		},
	});
}

function signinWithPasskeyResponse(c: Context, deps: ApiShellDependencies, result: HonoApiSigninWithPasskeyResult): Response {
	setApiHeaders(c);
	return new Response(JSON.stringify(result.body), {
		status: result.status,
		headers: {
			'Access-Control-Allow-Origin': deps.config.url,
			'Access-Control-Allow-Credentials': 'true',
			'Cache-Control': 'private, max-age=0, must-revalidate',
			'Content-Type': 'application/json; charset=utf-8',
		},
	});
}

function apiErrorResponse(c: Context, err: HonoApiError): Response {
	setApiHeaders(c);
	return new Response(JSON.stringify(err.toBody()), {
		status: err.status,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'private, max-age=0, must-revalidate',
			'Content-Type': 'application/json; charset=utf-8',
			...err.headers,
		},
	});
}

async function jsonBody(c: Context): Promise<Record<string, unknown>> {
	try {
		const body = await c.req.json();
		return body != null && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
	} catch {
		throw invalidJsonBody();
	}
}

function tokenFromRequest(c: Context, body: Record<string, unknown>): string | null {
	const authorization = c.req.header('authorization');
	if (authorization != null) {
		const match = authorization.match(/^Bearer\s+(.+)$/i);
		if (match) return match[1];
	}

	return typeof body.i === 'string' ? body.i : null;
}

function getRequestIp(c: Context, config: Config): string {
	if (config.trustProxy !== false) {
		const forwardedFor = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
		if (forwardedFor) return forwardedFor;

		const realIp = c.req.header('x-real-ip');
		if (realIp) return realIp;

		const cfConnectingIp = c.req.header('cf-connecting-ip');
		if (cfConnectingIp) return cfConnectingIp;
	}

	return c.req.header('x-misskey-remote-address') ?? '0.0.0.0';
}

async function runApiEndpoint(c: Context, handler: () => Promise<Response>): Promise<Response> {
	try {
		return await handler();
	} catch (err) {
		if (err instanceof HonoApiError) {
			return apiErrorResponse(c, err);
		}

		throw err;
	}
}

async function authenticateOptionalRequest(
	deps: ApiShellDependencies,
	c: Context,
	body: Record<string, unknown>,
): Promise<HonoApiAuthenticated> {
	const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
	assertOptionalCredential(auth);
	return auth;
}

export function createApiShellApp(deps: ApiShellDependencies): Hono {
	const app = new Hono();

	app.use('*', async (c, next) => {
		setApiHeaders(c);
		await next();
	});

	app.options('*', (c) => {
		c.header('Access-Control-Allow-Methods', 'GET,HEAD,POST,OPTIONS');
		const requestedHeaders = c.req.header('Access-Control-Request-Headers');
		if (requestedHeaders != null) {
			c.header('Access-Control-Allow-Headers', requestedHeaders);
		}
		return c.body(null, 204);
	});

	app.get('/v1/instance/peers', async (c) => {
		return jsonResponse(c, await listActiveInstanceHostsFromDatabase(deps.db));
	});

	app.post('/signup', async (c) => {
		return await runApiEndpoint(c, async () => {
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

	app.post('/auth/session/generate', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiAuthSessionGenerate(deps, body));
		});
	});

	app.post('/auth/session/show', async (c) => {
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

	app.post('/i', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiI(deps, auth.user, auth.token));
		});
	});

	app.post('/miauth/gen-token', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			return jsonResponse(c, await handleHonoApiMiauthGenToken(deps, auth.user, body));
		});
	});

	app.post('/miauth/:session/check', async (c) => {
		return await runApiEndpoint(c, async () => {
			return jsonResponse(c, await handleHonoApiMiauthCheck(deps, c.req.param('session')));
		});
	});

	app.post('/my/apps', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiMyApps(deps, auth.user, body));
		});
	});

	app.all('/clear-browser-cache', (c) => {
		if (c.req.method === 'GET' || c.req.method === 'POST') {
			c.header('Clear-Site-Data', '"cache", "prefetchCache", "prerenderCache", "executionContexts"');
			return c.body(null, 204);
		}

		return c.body(null, 405);
	});

	app.all('/*', (c) => jsonResponse(c, unknownApiEndpoint, 404));

	app.notFound((c) => {
		setApiHeaders(c);
		return c.body('404 Not Found', 404);
	});

	return app;
}
