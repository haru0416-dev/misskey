/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import ipaddr from 'ipaddr.js';
import { recordException } from '@/telemetry.js';
import type { Context } from 'hono';
import type { Config } from '@/config.js';
import { assertOptionalCredential, authenticateHonoApiToken, type HonoApiAuthenticated } from './auth.js';
import { HonoApiError, invalidJsonBody, payloadTooLargeError, rolePermissionDeniedError } from './error.js';
import { readRequestBodyWithLimit } from '../body-limit.js';
import { hasHonoApiRolePolicyOrIsRoot, isHonoApiAdministrator, isHonoApiModerator } from './role-policy.js';
import type { HonoApiSigninFlowResult } from './signin.js';
import type { HonoApiSigninWithPasskeyResult } from './signin-with-passkey.js';
import type { ApiShellDependencies } from './shell.js';

export function setApiHeaders(c: Context): void {
	c.header('Access-Control-Allow-Origin', '*');
	c.header('Cache-Control', 'private, max-age=0, must-revalidate');
}

export function jsonResponse(c: Context, body: unknown, status = 200, headers: Record<string, string> = {}): Response {
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

export function emptyResponse(c: Context): Response {
	setApiHeaders(c);
	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'private, max-age=0, must-revalidate',
		},
	});
}

export function rawStatusResponse(c: Context, status: number): Response {
	setApiHeaders(c);
	return new Response(null, {
		status,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'private, max-age=0, must-revalidate',
		},
	});
}

export function signinFlowResponse(c: Context, deps: ApiShellDependencies, result: HonoApiSigninFlowResult): Response {
	setApiHeaders(c);
	const headers: Record<string, string> = {
		'Access-Control-Allow-Origin': deps.config.instance.url,
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

export function signinWithPasskeyResponse(c: Context, deps: ApiShellDependencies, result: HonoApiSigninWithPasskeyResult): Response {
	setApiHeaders(c);
	return new Response(JSON.stringify(result.body), {
		status: result.status,
		headers: {
			'Access-Control-Allow-Origin': deps.config.instance.url,
			'Access-Control-Allow-Credentials': 'true',
			'Cache-Control': 'private, max-age=0, must-revalidate',
			'Content-Type': 'application/json; charset=utf-8',
		},
	});
}

export function publicCacheHeadersWhenAnonymous(auth: HonoApiAuthenticated, seconds: number): Record<string, string> {
	return auth.user == null ? { 'Cache-Control': `public, max-age=${seconds}` } : {};
}

export function apiErrorResponse(c: Context, err: HonoApiError): Response {
	setApiHeaders(c);

	// ApiCallService.#sendApiError 相当: 401以外のclient系エラーには invalid_request の
	// WWW-Authenticate を付ける (401系/permission系は error.ts のファクトリが個別に設定済み)。
	const extraHeaders: Record<string, string> = {};
	if (err.kind === 'client' && err.status !== 401 && err.code !== 'RATE_LIMIT_EXCEEDED' && err.headers['WWW-Authenticate'] == null) {
		extraHeaders['WWW-Authenticate'] = `Bearer realm="Misskey", error="invalid_request", error_description="${err.message}"`;
	}

	return new Response(JSON.stringify(err.toBody()), {
		status: err.status,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'private, max-age=0, must-revalidate',
			'Content-Type': 'application/json; charset=utf-8',
			...extraHeaders,
			...err.headers,
		},
	});
}

// upstream (Fastify) はJSONエンドポイントに 1 MiB の bodyLimit を設定していた。同じ上限で
// 実バイト数を数えながら読む (超過は 413)。
const JSON_BODY_LIMIT = 1024 * 1024;
const textDecoder = new TextDecoder();

export async function jsonBody(c: Context): Promise<Record<string, unknown>> {
	const raw = await readRequestBodyWithLimit(c.req.raw, JSON_BODY_LIMIT, payloadTooLargeError);
	try {
		const body = JSON.parse(textDecoder.decode(raw)) as unknown;
		return body != null && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
	} catch {
		throw invalidJsonBody();
	}
}

export function tokenFromRequest(c: Context, body: Record<string, unknown>): string | null {
	const authorization = c.req.header('authorization');
	if (authorization != null) {
		// 原典 (ApiCallService) 同様、スキーム名は大文字小文字を区別する ('bearer' は不可)
		const match = authorization.match(/^Bearer (.+)$/);
		if (match?.[1] != null) return match[1];
	}

	return typeof body.i === 'string' ? body.i : null;
}

export function getRequestIp(c: Context, config: Config): string {
	const remoteAddress = c.req.header('x-misskey-remote-address') ?? '0.0.0.0';
	const trustedNetworks = config.server.reverseProxy.trustedNetworks;
	if (trustedNetworks.length === 0) return remoteAddress;

	const forwarded = c.req.header('x-forwarded-for')?.split(',').map(address => address.trim()).filter(Boolean)
		?? [c.req.header('x-real-ip') ?? c.req.header('cf-connecting-ip')].filter((address): address is string => address != null && address !== '');
	if (forwarded.length === 0) return remoteAddress;

	const addresses = [...forwarded, remoteAddress];
	const networks = trustedNetworks.map(network => ipaddr.parseCIDR(network));
	const isTrusted = (address: string): boolean => {
		if (!ipaddr.isValid(address)) return false;

		const parsed = ipaddr.process(address);
		return networks.some(([network, prefix]) => parsed.kind() === network.kind() && parsed.match(network, prefix));
	};

	for (let index = addresses.length - 1, hop = 0; index > 0; index--, hop++) {
		const address = addresses[index];
		if (address != null && !isTrusted(address)) return address;
	}

	return addresses[0] ?? remoteAddress;
}

export async function runApiEndpoint(c: Context, handler: () => Promise<Response>): Promise<Response> {
	try {
		return await handler();
	} catch (err) {
		if (err instanceof HonoApiError) {
			return apiErrorResponse(c, err);
		}

		// 予期しない例外の詳細はテレメトリにのみ記録し、クライアントには公開しない。
		if (err instanceof Error) {
			recordException(err);
			return apiErrorResponse(c, new HonoApiError({
				status: 500,
				message: 'Internal error occurred. Please contact us if the error persists.',
				code: 'INTERNAL_ERROR',
				id: '5d37dbcb-891e-41ca-a3d6-e690c97775ac',
				kind: 'server',
				info: { id: randomUUID() },
			}));
		}

		throw err;
	}
}

export async function authenticateOptionalRequest(
	deps: ApiShellDependencies,
	c: Context,
	body: Record<string, unknown>,
): Promise<HonoApiAuthenticated> {
	const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
	assertOptionalCredential(auth);
	return auth;
}

export async function assertHonoApiModerator(deps: ApiShellDependencies, auth: { user: NonNullable<HonoApiAuthenticated['user']> }): Promise<void> {
	if (!await isHonoApiModerator(deps, auth.user)) {
		throw rolePermissionDeniedError();
	}
}

export async function assertHonoApiAdmin(deps: ApiShellDependencies, auth: { user: NonNullable<HonoApiAuthenticated['user']> }): Promise<void> {
	if (!await isHonoApiAdministrator(deps, auth.user)) {
		throw rolePermissionDeniedError();
	}
}

export async function assertHonoApiCanManageAvatarDecorations(deps: ApiShellDependencies, auth: { user: NonNullable<HonoApiAuthenticated['user']> }): Promise<void> {
	if (!(await hasHonoApiRolePolicyOrIsRoot(deps, auth.user, 'canManageAvatarDecorations'))) {
		throw rolePermissionDeniedError();
	}
}

export async function assertHonoApiCanManageCustomEmojis(deps: ApiShellDependencies, auth: { user: NonNullable<HonoApiAuthenticated['user']> }): Promise<void> {
	if (!(await hasHonoApiRolePolicyOrIsRoot(deps, auth.user, 'canManageCustomEmojis'))) {
		throw rolePermissionDeniedError();
	}
}
