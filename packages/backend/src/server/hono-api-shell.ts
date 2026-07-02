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
import { handleHonoApiGetAvatarDecorations } from './hono-api-avatar-decorations.js';
import { handleHonoApiEmailAddressAvailable, handleHonoApiGetOnlineUsersCount, handleHonoApiUsernameAvailable } from './hono-api-availability.js';
import { handleHonoApiAppCreate, handleHonoApiAppShow, handleHonoApiIAuthorizedApps, handleHonoApiIApps, handleHonoApiIRevokeToken, handleHonoApiMyApps } from './hono-api-app.js';
import { handleHonoApiAuthAccept, handleHonoApiAuthSessionGenerate, handleHonoApiAuthSessionShow, handleHonoApiAuthSessionUserkey } from './hono-api-auth-session.js';
import { HonoApiError, invalidJsonBody } from './hono-api-error.js';
import { handleHonoApiEmoji, handleHonoApiEmojis } from './hono-api-emojis.js';
import { handleHonoApiEndpoint, handleHonoApiEndpoints } from './hono-api-endpoints.js';
import { handleHonoApiFederationInstances, handleHonoApiFederationShowInstance, handleHonoApiFederationStats, normalizeHonoApiFederationQuery } from './hono-api-federation.js';
import { handleHonoApiHashtagsList, handleHonoApiHashtagsSearch, handleHonoApiHashtagsShow, handleHonoApiHashtagsTrend } from './hono-api-hashtags.js';
import { handleHonoApiI, handleHonoApiISigninHistory } from './hono-api-i.js';
import { handleHonoApiAnnouncements, handleHonoApiAnnouncementShow } from './hono-api-announcements.js';
import { handleHonoApiMeta, handleHonoApiPing, handleHonoApiServerInfo, handleHonoApiTest } from './hono-api-meta.js';
import { handleHonoApiMiauthCheck, handleHonoApiMiauthGenToken } from './hono-api-miauth.js';
import type { HonoApiMainStreamPublisher } from './hono-api-notification.js';
import { handleHonoApiRetention } from './hono-api-retention.js';
import { handleHonoApiRolesList, handleHonoApiRolesShow } from './hono-api-roles.js';
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
	emailService: Pick<EmailService, 'sendEmail' | 'validateEmailForAccount'>;
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

function jsonResponse(c: Context, body: unknown, status = 200, headers: Record<string, string> = {}): Response {
	setApiHeaders(c);
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'private, max-age=0, must-revalidate',
			'Content-Type': 'application/json; charset=utf-8',
			...headers,
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

function publicCacheHeadersWhenAnonymous(auth: HonoApiAuthenticated, seconds: number): Record<string, string> {
	return auth.user == null ? { 'Cache-Control': `public, max-age=${seconds}` } : {};
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

	app.post('/announcements', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiAnnouncements(deps, auth.user, body));
		});
	});

	app.post('/announcements/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiAnnouncementShow(deps, auth.user, body));
		});
	});

	app.post('/email-address/available', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiEmailAddressAvailable(deps, body));
		});
	});

	app.get('/emoji', async (c) => {
		return await runApiEndpoint(c, async () => {
			return jsonResponse(c, await handleHonoApiEmoji(deps, c.req.query()), 200, {
				'Cache-Control': 'public, max-age=3600',
			});
		});
	});

	app.post('/emoji', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiEmoji(deps, body), 200, {
				'Cache-Control': 'public, max-age=3600',
			});
		});
	});

	app.get('/emojis', async (c) => {
		return await runApiEndpoint(c, async () => {
			return jsonResponse(c, await handleHonoApiEmojis(deps), 200, {
				'Cache-Control': 'public, max-age=3600',
			});
		});
	});

	app.post('/emojis', async (c) => {
		return await runApiEndpoint(c, async () => {
			await jsonBody(c);
			return jsonResponse(c, await handleHonoApiEmojis(deps), 200, {
				'Cache-Control': 'public, max-age=3600',
			});
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

	app.post('/endpoints', async (c) => {
		return await runApiEndpoint(c, async () => {
			return jsonResponse(c, await handleHonoApiEndpoints());
		});
	});

	app.post('/endpoint', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiEndpoint(body));
		});
	});

	app.get('/federation/instances', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = normalizeHonoApiFederationQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiFederationInstances(deps, auth.user, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/federation/instances', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiFederationInstances(deps, auth.user, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/federation/show-instance', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiFederationShowInstance(deps, auth.user, body));
		});
	});

	app.get('/federation/stats', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = normalizeHonoApiFederationQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiFederationStats(deps, auth.user, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/federation/stats', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiFederationStats(deps, auth.user, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/hashtags/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiHashtagsList(deps, body));
		});
	});

	app.post('/hashtags/search', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiHashtagsSearch(deps, body));
		});
	});

	app.post('/hashtags/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiHashtagsShow(deps, body));
		});
	});

	app.post('/hashtags/trend', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiHashtagsTrend(deps, body));
		});
	});

	app.post('/meta', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiMeta(deps, body));
		});
	});

	app.post('/ping', async (c) => {
		return await runApiEndpoint(c, async () => {
			await jsonBody(c);
			return jsonResponse(c, handleHonoApiPing());
		});
	});

	app.get('/retention', async (c) => {
		return await runApiEndpoint(c, async () => {
			return jsonResponse(c, await handleHonoApiRetention(deps, {}), 200, {
				'Cache-Control': 'public, max-age=3600',
			});
		});
	});

	app.post('/retention', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiRetention(deps, body), 200, {
				'Cache-Control': 'public, max-age=3600',
			});
		});
	});

	app.post('/roles/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiRolesList(deps, body));
		});
	});

	app.post('/roles/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiRolesShow(deps, body));
		});
	});

	app.get('/server-info', async (c) => {
		return await runApiEndpoint(c, async () => {
			return jsonResponse(c, await handleHonoApiServerInfo(deps.meta), 200, {
				'Cache-Control': 'public, max-age=60',
			});
		});
	});

	app.post('/server-info', async (c) => {
		return await runApiEndpoint(c, async () => {
			await jsonBody(c);
			return jsonResponse(c, await handleHonoApiServerInfo(deps.meta), 200, {
				'Cache-Control': 'public, max-age=60',
			});
		});
	});

	app.post('/test', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, handleHonoApiTest(body));
		});
	});

	app.get('/get-online-users-count', async (c) => {
		return await runApiEndpoint(c, async () => {
			return jsonResponse(c, await handleHonoApiGetOnlineUsersCount(deps), 200, {
				'Cache-Control': 'public, max-age=60',
			});
		});
	});

	app.post('/get-online-users-count', async (c) => {
		return await runApiEndpoint(c, async () => {
			await jsonBody(c);
			return jsonResponse(c, await handleHonoApiGetOnlineUsersCount(deps), 200, {
				'Cache-Control': 'public, max-age=60',
			});
		});
	});

	app.post('/get-avatar-decorations', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiGetAvatarDecorations(deps, body));
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

	app.post('/i/apps', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			return jsonResponse(c, await handleHonoApiIApps(deps, auth.user, body));
		});
	});

	app.post('/i/authorized-apps', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			return jsonResponse(c, await handleHonoApiIAuthorizedApps(deps, auth.user, body));
		});
	});

	app.post('/i/revoke-token', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			await handleHonoApiIRevokeToken(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/i/signin-history', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			return jsonResponse(c, await handleHonoApiISigninHistory(deps, auth.user, body));
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

	app.post('/username/available', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiUsernameAvailable(deps, body));
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
