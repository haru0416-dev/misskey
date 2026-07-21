/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import dns from 'node:dns/promises';
import * as htmlParser from 'node-html-parser';
import type * as Redis from 'ioredis';
import { extractLinkHeaderUrisByRel } from '@/misc/parse-link-header.js';
import ipaddr from 'ipaddr.js';
import { permissions as kinds } from 'misskey-js';
import type { Config } from '@/config.js';
import { createAccessTokenInDatabase, deleteAccessTokenByTokenFromDatabase } from '@/core/AccessTokenStore.js';
import { fetchLocalUserByNativeTokenFromDatabase } from '@/core/UserStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiLocalUser } from '@/models/User.js';
import { MemoryKVCache } from '@/misc/cache.js';
import { genId } from '@/misc/id/gen-id.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import { verifyS256CodeChallenge } from '@/misc/pkce.js';
import { StatusError } from '@/misc/status-error.js';
import type Logger from '@/logger.js';
import type { CommonData } from '@/server/web/views/_.js';
import { OAuthPage } from '@/server/web/views/oauth.js';
import {
	AccessDeniedError,
	InvalidGrantError,
	InvalidRequestError,
	InvalidScopeError,
	OAuthProviderError,
	UnsupportedGrantTypeError,
	UnsupportedResponseTypeError,
} from './errors.js';

// TODO: Consider migrating to @node-oauth/oauth2-server once
// https://github.com/node-oauth/node-oauth2-server/issues/180 is figured out.
// Upstream the various validations and RFC9207 implementation in that case.

// Follows https://indieauth.spec.indieweb.org/#client-identifier
// This is also mostly similar to https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation
// although Google has stricter rule.
function validateClientId(raw: string): URL {
	const url = ((): URL => {
		try {
			return new URL(raw);
		} catch {
			throw new InvalidRequestError('client_id must be a valid URL');
		}
	})();

	const allowedProtocols = process.env['NODE_ENV'] === 'test' ? ['http:', 'https:'] : ['https:'];
	if (!allowedProtocols.includes(url.protocol)) {
		throw new InvalidRequestError('client_id must be a valid HTTPS URL');
	}

	const segments = url.pathname.split('/');
	if (segments.includes('.') || segments.includes('..')) {
		throw new InvalidRequestError('client_id must not contain dot path segments');
	}

	if (url.hash) {
		throw new InvalidRequestError('client_id must not contain a fragment component');
	}

	if (url.username || url.password) {
		throw new InvalidRequestError('client_id must not contain a username or a password');
	}

	if (!url.hostname.match(/\.\w+$/) && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
		throw new InvalidRequestError('client_id must have a domain name as a host name');
	}

	return url;
}

interface ClientInformation {
	id: string;
	redirectUris: string[];
	name: string;
	logo: string | null;
}

type OAuthRequestParameterValue = string | string[] | undefined;

export interface OAuthRequestParameters {
	[key: string]: OAuthRequestParameterValue;
	client_id?: OAuthRequestParameterValue;
	redirect_uri?: OAuthRequestParameterValue;
	response_type?: OAuthRequestParameterValue;
	state?: OAuthRequestParameterValue;
	code_challenge?: OAuthRequestParameterValue;
	code_challenge_method?: OAuthRequestParameterValue;
	scope?: OAuthRequestParameterValue;
	transaction_id?: OAuthRequestParameterValue;
	cancel?: OAuthRequestParameterValue;
	login_token?: OAuthRequestParameterValue;
	grant_type?: OAuthRequestParameterValue;
	code?: OAuthRequestParameterValue;
	code_verifier?: OAuthRequestParameterValue;
}

interface AuthorizationRequest {
	clientId: string;
	redirectUri: string;
	state?: string;
	scopes: string[];
	codeChallenge: string;
	codeChallengeMethod: string;
}

interface AuthorizationRequestSeed {
	clientInfo: ClientInformation;
	clientId: string;
	redirectUri: string;
	state?: string;
	requestedScope: string[];
	codeChallenge?: string;
	codeChallengeMethod?: string;
}

interface AuthorizationTransaction {
	client: ClientInformation;
	request: AuthorizationRequest;
}

interface AuthorizationCodeGrant {
	clientId: string;
	userId: string;
	redirectUri: string;
	codeChallenge: string;
	scopes: string[];
}

type AuthorizationCodeGrantState =
	| { status: 'pending'; grant: AuthorizationCodeGrant }
	| { status: 'exchanging'; grant: AuthorizationCodeGrant }
	| { status: 'issued'; grant: AuthorizationCodeGrant; accessToken: string }
	| { status: 'revoked'; grant: AuthorizationCodeGrant; accessToken?: string };

type AuthorizationCodeGrantClaim =
	| { status: 'claimed'; grant: AuthorizationCodeGrant }
	| { status: 'reused'; grant: AuthorizationCodeGrant; accessToken?: string };

export interface OAuthEphemeralStore {
	setAuthorizationTransaction(id: string, value: AuthorizationTransaction): Promise<void>;
	consumeAuthorizationTransaction(id: string): Promise<AuthorizationTransaction | null>;
	setGrantCode(code: string, value: AuthorizationCodeGrant): Promise<void>;
	claimGrantCode(code: string): Promise<AuthorizationCodeGrantClaim | null>;
	finalizeGrantCode(code: string, accessToken: string): Promise<'issued' | 'revoked'>;
	dispose(): void;
}

type HeaderSource = Headers | Record<string, string>;

type HttpResponseLike = {
	headers: {
		get: (key: string) => string | null;
	};
	url: string;
	json: () => Promise<unknown>;
	text: () => Promise<string>;
};

export type OAuthProviderRuntimeDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	httpRequestService: {
		send: (url: string) => Promise<HttpResponseLike>;
	};
	getCommonData: () => Promise<CommonData>;
	logger: Logger;
	redis?: Redis.Redis;
	ephemeralStore?: OAuthEphemeralStore;
	fetchLocalUserByNativeToken?: (token: string) => Promise<MiLocalUser | null>;
	createAccessToken?: typeof createAccessTokenInDatabase;
	deleteAccessTokenByToken?: typeof deleteAccessTokenByTokenFromDatabase;
};

export type OAuthProviderRuntime = {
	authorize: (params: OAuthRequestParameters) => Promise<Response>;
	decision: (params: OAuthRequestParameters) => Promise<Response>;
	token: (params: OAuthRequestParameters) => Promise<Response>;
	unknownEndpoint: () => Response;
	tokenOptions: () => Response;
	dispose: () => void;
};

function parseMicroformats(
	doc: htmlParser.HTMLElement,
	baseUrl: string,
	id: string,
): { name: string | null; logo: string | null } {
	let name: string | null = null;
	let logo: string | null = null;

	const hApp = doc.querySelector('.h-app');
	if (hApp == null) return { name, logo };

	const nameEl = hApp.querySelector('.p-name');
	if (nameEl != null) {
		const href = nameEl.attributes['href'] || nameEl.attributes['src'];
		if (href != null && new URL(href, baseUrl).toString() === new URL(id).toString()) {
			name = nameEl.textContent.trim();
		}
	}

	const logoEl = hApp.querySelector('.u-logo');
	if (logoEl != null) {
		const href = logoEl.attributes['href'] || logoEl.attributes['src'];
		if (href != null) {
			logo = new URL(href, baseUrl).toString();
		}
	}

	return { name, logo };
}

async function discoverClientInformation(
	logger: Logger,
	httpRequestService: OAuthProviderRuntimeDependencies['httpRequestService'],
	id: string,
): Promise<ClientInformation> {
	try {
		const res = await httpRequestService.send(id);

		const redirectUris: string[] = [];
		let name = id;
		let logo: string | null = null;

		const linkHeader = res.headers.get('link');
		if (linkHeader) {
			redirectUris.push(...extractLinkHeaderUrisByRel(linkHeader, 'redirect_uri'));
		}

		const contentType = res.headers.get('content-type');
		const mediaType = contentType?.split(';', 1)[0]?.trim() ?? null;
		if (mediaType === 'application/json') {
			const json = (await res.json()) as {
				client_id: string;
				client_name?: string;
				client_uri: string;
				logo_uri?: string;
				redirect_uris?: string[];
			};

			if (json.client_id !== id) {
				throw new InvalidRequestError('client_id in the document does not match the client_id URL');
			}

			if (!json.client_uri || !id.startsWith(json.client_uri)) {
				throw new InvalidRequestError('client_uri is not a prefix of client_id');
			}

			if (typeof json.client_name === 'string') {
				name = json.client_name;
			}

			if (typeof json.logo_uri === 'string') {
				logo = new URL(json.logo_uri, res.url).toString();
			}

			if (Array.isArray(json.redirect_uris)) {
				redirectUris.push(...json.redirect_uris.filter((uri): uri is string => typeof uri === 'string'));
			}
		} else {
			const text = await res.text();
			const doc = htmlParser.parse(`<div>${text}</div>`);

			redirectUris.push(
				...[...doc.querySelectorAll('link[rel=redirect_uri][href]')]
					.map((el) => el.attributes['href'])
					.filter((href): href is string => href != null),
			);

			if (text) {
				const microformats = parseMicroformats(doc, res.url, id);
				if (typeof microformats.name === 'string') {
					name = microformats.name;
				}
				if (typeof microformats.logo === 'string') {
					logo = microformats.logo;
				}
			}
		}

		return {
			id,
			redirectUris: redirectUris.map((uri) => new URL(uri, res.url).toString()),
			name: typeof name === 'string' ? name : id,
			logo,
		};
	} catch (err) {
		logger.error('Error while fetching client information', { err });
		if (err instanceof StatusError) {
			throw new InvalidRequestError('Failed to fetch client information');
		}
		if (err instanceof OAuthProviderError) {
			throw err;
		}

		const wrapped = new InvalidRequestError('Failed to parse client information');
		wrapped.status = 500;
		wrapped.statusCode = 500;
		wrapped.error = 'server_error';
		throw wrapped;
	}
}

function firstValue(value: unknown | unknown[] | undefined): string | undefined {
	const firstElement = Array.isArray(value) ? value[0] : value;
	return typeof firstElement === 'string' ? firstElement : undefined;
}

function normalizeScope(scope: string | string[] | undefined): string[] {
	const raw = Array.isArray(scope) ? scope : scope != null ? [scope] : [];
	return raw.flatMap((value) => value.split(/\s+/)).filter(Boolean);
}

export function parseUrlEncodedParameters(rawBody: string): OAuthRequestParameters {
	const parsed: OAuthRequestParameters = {};
	for (const [key, value] of new URLSearchParams(rawBody).entries()) {
		const current = parsed[key];
		if (current == null) {
			parsed[key] = value;
		} else if (Array.isArray(current)) {
			current.push(value);
		} else {
			parsed[key] = [current, value];
		}
	}

	return parsed;
}

export function toRequestParameters(body: unknown): OAuthRequestParameters {
	if (typeof body === 'string') {
		return parseUrlEncodedParameters(body);
	}

	if (body instanceof URLSearchParams) {
		return parseUrlEncodedParameters(body.toString());
	}

	if (body == null || typeof body !== 'object' || Array.isArray(body)) {
		return {};
	}

	return Object.fromEntries(
		Object.entries(body).filter(
			([_, value]) => typeof value === 'string' || (Array.isArray(value) && value.every((v) => typeof v === 'string')),
		),
	);
}

function noStoreHeaders(extra?: HeaderSource): Headers {
	const headers = new Headers(extra);
	headers.set('Cache-Control', 'no-store');
	headers.set('Pragma', 'no-cache');
	return headers;
}

function tokenCorsHeaders(extra?: HeaderSource): Headers {
	const headers = noStoreHeaders(extra);
	headers.set('Access-Control-Allow-Origin', '*');
	headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
	headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	return headers;
}

function jsonResponse(value: unknown, status = 200, headers = noStoreHeaders()): Response {
	if (!headers.has('Content-Type')) {
		headers.set('Content-Type', 'application/json; charset=utf-8');
	}

	return new Response(JSON.stringify(value), {
		status,
		headers,
	});
}

function htmlResponse(html: string): Response {
	return new Response(html, {
		status: 200,
		headers: noStoreHeaders({
			'Content-Type': 'text/html; charset=utf-8',
		}),
	});
}

function createUnsupportedResponseTypeError(): OAuthProviderError {
	const error = new UnsupportedResponseTypeError();
	error.status = 501;
	error.statusCode = 501;
	return error;
}

function createForbiddenAccessDenied(description: string): OAuthProviderError {
	const error = new AccessDeniedError(description);
	error.status = 403;
	error.statusCode = 403;
	return error;
}

function normalizeOAuthProviderError(error: unknown): OAuthProviderError {
	if (error instanceof OAuthProviderError) {
		return error;
	}

	const wrapped = new InvalidRequestError('request is invalid');
	if (error instanceof Error) {
		wrapped.error_description = error.message;
	}
	return wrapped;
}

function oauthProviderErrorResponse(error: OAuthProviderError, headers = noStoreHeaders()): Response {
	return jsonResponse(
		{
			error: error.error,
			...(error.expose && error.error_description ? { error_description: error.error_description } : {}),
		},
		error.statusCode ?? error.status ?? 400,
		headers,
	);
}

function appendIssuer(payload: Record<string, string>, issuerUrl: string): Record<string, string> {
	return {
		...payload,
		iss: issuerUrl,
	};
}

function redirectWithQuery(redirectUriString: string, payload: Record<string, string>): Response {
	const redirectUri = new URL(redirectUriString);
	for (const [key, value] of Object.entries(payload)) {
		redirectUri.searchParams.set(key, value);
	}

	return new Response(null, {
		status: 302,
		headers: noStoreHeaders({
			Location: redirectUri.toString(),
		}),
	});
}

const OAUTH_STATE_TTL = 1000 * 60 * 5;
const OAUTH_TOKEN_REVOCATION_ATTEMPTS = 3;
const consumeRedisValueScript = `
local value = redis.call('get', KEYS[1])
if value then redis.call('del', KEYS[1]) end
return value
`;
const claimRedisGrantCodeScript = `
local raw = redis.call('get', KEYS[1])
if not raw then
	local legacyRaw = redis.call('get', KEYS[2])
	if not legacyRaw then return nil end
	local legacyTtl = redis.call('pttl', KEYS[2])
	redis.call('del', KEYS[2])
	local legacyGrant = cjson.decode(legacyRaw)
	local migrated = { status = 'exchanging', grant = legacyGrant }
	if legacyTtl > 0 then
		redis.call('set', KEYS[1], cjson.encode(migrated), 'PX', legacyTtl)
	else
		redis.call('set', KEYS[1], cjson.encode(migrated))
	end
	return cjson.encode({ status = 'claimed', grant = legacyGrant })
end
local value = cjson.decode(raw)
local result = { grant = value.grant }
if value.status == 'pending' then
	value.status = 'exchanging'
	result.status = 'claimed'
else
	result.status = 'reused'
	if value.accessToken then result.accessToken = value.accessToken end
	value.status = 'revoked'
end
redis.call('set', KEYS[1], cjson.encode(value), 'KEEPTTL')
return cjson.encode(result)
`;
const finalizeRedisGrantCodeScript = `
local raw = redis.call('get', KEYS[1])
if not raw then return 'revoked' end
local value = cjson.decode(raw)
if value.status ~= 'exchanging' then
	if value.status == 'revoked' then
		value.accessToken = ARGV[1]
		redis.call('set', KEYS[1], cjson.encode(value), 'KEEPTTL')
	end
	return 'revoked'
end
value.status = 'issued'
value.accessToken = ARGV[1]
redis.call('set', KEYS[1], cjson.encode(value), 'KEEPTTL')
return 'issued'
`;

export function createMemoryOAuthEphemeralStore(): OAuthEphemeralStore {
	const authorizationTransactions = new MemoryKVCache<AuthorizationTransaction>(OAUTH_STATE_TTL);
	const grantCodes = new MemoryKVCache<AuthorizationCodeGrantState>(OAUTH_STATE_TTL);
	return {
		async setAuthorizationTransaction(id, value) {
			authorizationTransactions.set(id, value);
		},
		async consumeAuthorizationTransaction(id) {
			const value = authorizationTransactions.get(id) ?? null;
			authorizationTransactions.delete(id);
			return value;
		},
		async setGrantCode(code, value) {
			grantCodes.set(code, { status: 'pending', grant: value });
		},
		async claimGrantCode(code) {
			const value = grantCodes.get(code);
			if (value == null) return null;
			if (value.status === 'pending') {
				grantCodes.set(code, { status: 'exchanging', grant: value.grant });
				return { status: 'claimed', grant: value.grant };
			}
			grantCodes.set(code, {
				status: 'revoked',
				grant: value.grant,
				...(value.status === 'issued' || value.status === 'revoked' ? { accessToken: value.accessToken } : {}),
			});
			return {
				status: 'reused',
				grant: value.grant,
				...(value.status === 'issued' || value.status === 'revoked' ? { accessToken: value.accessToken } : {}),
			};
		},
		async finalizeGrantCode(code, accessToken) {
			const value = grantCodes.get(code);
			if (value?.status !== 'exchanging') {
				if (value?.status === 'revoked') grantCodes.set(code, { ...value, accessToken });
				return 'revoked';
			}
			grantCodes.set(code, { status: 'issued', grant: value.grant, accessToken });
			return 'issued';
		},
		dispose() {
			authorizationTransactions.dispose();
			grantCodes.dispose();
		},
	};
}

function createRedisOAuthEphemeralStore(redis: Redis.Redis): OAuthEphemeralStore {
	const set = async (key: string, value: unknown) => {
		await redis.set(key, JSON.stringify(value), 'PX', OAUTH_STATE_TTL);
	};
	const consume = async <T>(key: string): Promise<T | null> => {
		const raw = await redis.eval(consumeRedisValueScript, 1, key);
		if (typeof raw !== 'string') return null;
		try {
			return JSON.parse(raw) as T;
		} catch {
			return null;
		}
	};
	return {
		setAuthorizationTransaction: (id, value) => set(`oauth:authorization:${id}`, value),
		consumeAuthorizationTransaction: (id) => consume(`oauth:authorization:${id}`),
		setGrantCode: (code, value) => set(`oauth:grant:v2:${code}`, { status: 'pending', grant: value }),
		async claimGrantCode(code) {
			const raw = await redis.eval(claimRedisGrantCodeScript, 2, `oauth:grant:v2:${code}`, `oauth:grant:${code}`);
			if (typeof raw !== 'string') return null;
			try {
				return JSON.parse(raw) as AuthorizationCodeGrantClaim;
			} catch {
				return null;
			}
		},
		async finalizeGrantCode(code, accessToken) {
			const result = await redis.eval(finalizeRedisGrantCodeScript, 1, `oauth:grant:v2:${code}`, accessToken);
			return result === 'issued' ? 'issued' : 'revoked';
		},
		dispose() {},
	};
}

export function createOAuthProviderRuntime(deps: OAuthProviderRuntimeDependencies): OAuthProviderRuntime {
	const ephemeralStore =
		deps.ephemeralStore ??
		(deps.redis ? createRedisOAuthEphemeralStore(deps.redis) : createMemoryOAuthEphemeralStore());
	const fetchLocalUserByNativeToken =
		deps.fetchLocalUserByNativeToken ?? ((token: string) => fetchLocalUserByNativeTokenFromDatabase(deps.db, token));
	const createAccessToken = deps.createAccessToken ?? createAccessTokenInDatabase;
	const deleteAccessTokenByToken = deps.deleteAccessTokenByToken ?? deleteAccessTokenByTokenFromDatabase;

	async function revokeAccessToken(accessToken: string): Promise<void> {
		let lastError: unknown;
		for (let attempt = 0; attempt < OAUTH_TOKEN_REVOCATION_ATTEMPTS; attempt++) {
			try {
				await deleteAccessTokenByToken(deps.db, accessToken);
				return;
			} catch (error) {
				lastError = error;
			}
		}
		deps.logger.error(
			'Failed to revoke an access token after repeated authorization code use.',
			lastError instanceof Error ? lastError : null,
		);
		throw new OAuthProviderError('temporarily_unavailable', 'access token revocation is temporarily unavailable');
	}

	async function resolveAuthorizationRequest(params: OAuthRequestParameters): Promise<AuthorizationRequestSeed> {
		const clientId = firstValue(params.client_id);
		const redirectUriValue = firstValue(params.redirect_uri);
		const responseType = firstValue(params.response_type);
		const state = firstValue(params.state);
		const codeChallenge = firstValue(params.code_challenge);
		const codeChallengeMethod = firstValue(params.code_challenge_method);
		const requestedScope = normalizeScope(params.scope);

		deps.logger.info(
			`Validating authorization parameters, with client_id: ${clientId}, redirect_uri: ${redirectUriValue}, scope: ${requestedScope.join(' ')}`,
		);

		if (responseType !== 'code') {
			throw createUnsupportedResponseTypeError();
		}

		if (!clientId) {
			throw new InvalidRequestError('client_id must be provided');
		}

		const clientUrl = validateClientId(clientId);

		if (process.env['NODE_ENV'] !== 'test' || process.env['MISSKEY_TEST_CHECK_IP_RANGE'] === '1') {
			const lookup = await dns.lookup(clientUrl.hostname);
			if (ipaddr.parse(lookup.address).range() !== 'unicast') {
				throw new InvalidRequestError('client_id resolves to disallowed IP range.');
			}
		}

		const clientInfo = await discoverClientInformation(deps.logger, deps.httpRequestService, clientUrl.href);

		if (!redirectUriValue || !clientInfo.redirectUris.includes(redirectUriValue)) {
			throw new InvalidRequestError('Invalid redirect_uri');
		}

		return {
			clientInfo,
			clientId: clientInfo.id,
			redirectUri: redirectUriValue,
			...(state === undefined ? {} : { state }),
			requestedScope,
			...(codeChallenge === undefined ? {} : { codeChallenge }),
			...(codeChallengeMethod === undefined ? {} : { codeChallengeMethod }),
		};
	}

	function finalizeAuthorizationRequest(seed: AuthorizationRequestSeed): AuthorizationRequest {
		const scopes = [...new Set(seed.requestedScope)].filter((scope) => (<readonly string[]>kinds).includes(scope));
		if (!seed.requestedScope.length || !scopes.length) {
			throw new InvalidScopeError('`scope` parameter has no known scope', seed.requestedScope.join(' '));
		}

		if (typeof seed.codeChallenge !== 'string') {
			throw new InvalidRequestError('`code_challenge` parameter is required');
		}
		if (seed.codeChallengeMethod !== 'S256') {
			throw new InvalidRequestError('`code_challenge_method` parameter must be set as S256');
		}

		return {
			clientId: seed.clientId,
			redirectUri: seed.redirectUri,
			...(seed.state === undefined ? {} : { state: seed.state }),
			scopes,
			codeChallenge: seed.codeChallenge,
			codeChallengeMethod: seed.codeChallengeMethod,
		};
	}

	async function findUserByLoginToken(loginToken: string): Promise<MiLocalUser> {
		const user = await fetchLocalUserByNativeToken(loginToken);
		if (!user) {
			throw new InvalidRequestError('No such user');
		}

		return user;
	}

	async function authorize(params: OAuthRequestParameters): Promise<Response> {
		let validatedRedirectUri: string | undefined;
		let state: string | undefined;

		try {
			const seed = await resolveAuthorizationRequest(params);
			const { clientInfo } = seed;
			validatedRedirectUri = seed.redirectUri;
			state = seed.state;
			const authorizationRequest = finalizeAuthorizationRequest(seed);

			const transactionId = secureRndstr(128);
			await ephemeralStore.setAuthorizationTransaction(transactionId, {
				client: clientInfo,
				request: authorizationRequest,
			});

			deps.logger.info(`Rendering authorization page for "${clientInfo.name}"`);

			return htmlResponse(
				String(
					await OAuthPage({
						...(await deps.getCommonData()),
						transactionId,
						clientName: clientInfo.name,
						...(clientInfo.logo == null ? {} : { clientLogo: clientInfo.logo }),
						scope: authorizationRequest.scopes,
					}),
				),
			);
		} catch (error) {
			const providerError = normalizeOAuthProviderError(error);
			if (validatedRedirectUri && providerError.allow_redirect && providerError.error !== 'unsupported_response_type') {
				return redirectWithQuery(
					validatedRedirectUri,
					appendIssuer(
						{
							error: providerError.error,
							...(state ? { state } : {}),
						},
						deps.config.instance.url,
					),
				);
			}

			return oauthProviderErrorResponse(providerError);
		}
	}

	async function decision(params: OAuthRequestParameters): Promise<Response> {
		try {
			const transactionId = firstValue(params.transaction_id);
			if (!transactionId) {
				throw new InvalidRequestError('Missing transaction ID');
			}

			const transaction = await ephemeralStore.consumeAuthorizationTransaction(transactionId);
			if (!transaction) {
				throw createForbiddenAccessDenied('Invalid or expired transaction ID');
			}
			const cancel = !!firstValue(params.cancel);
			deps.logger.info(`Received the decision. Cancel: ${cancel}`);
			if (cancel) {
				return redirectWithQuery(
					transaction.request.redirectUri,
					appendIssuer(
						{
							error: 'access_denied',
							...(transaction.request.state ? { state: transaction.request.state } : {}),
						},
						deps.config.instance.url,
					),
				);
			}

			const loginToken = firstValue(params.login_token);
			if (!loginToken) {
				throw new InvalidRequestError('No user');
			}

			deps.logger.info(`Checking the user before sending authorization code to ${transaction.client.id}`);
			const user = await findUserByLoginToken(loginToken);

			deps.logger.info(
				`Sending authorization code on behalf of user ${user.id} to ${transaction.client.id} through ${transaction.request.redirectUri}, with scope: [${transaction.request.scopes}]`,
			);

			const code = secureRndstr(128);
			await ephemeralStore.setGrantCode(code, {
				clientId: transaction.client.id,
				userId: user.id,
				redirectUri: transaction.request.redirectUri,
				codeChallenge: transaction.request.codeChallenge,
				scopes: transaction.request.scopes,
			});

			return redirectWithQuery(
				transaction.request.redirectUri,
				appendIssuer(
					{
						code,
						...(transaction.request.state ? { state: transaction.request.state } : {}),
					},
					deps.config.instance.url,
				),
			);
		} catch (error) {
			return oauthProviderErrorResponse(normalizeOAuthProviderError(error));
		}
	}

	async function token(params: OAuthRequestParameters): Promise<Response> {
		try {
			const grantType = firstValue(params.grant_type);
			if (!grantType) {
				throw new InvalidRequestError('grant_type is required');
			}
			if (grantType !== 'authorization_code') {
				throw new UnsupportedGrantTypeError();
			}

			const code = firstValue(params.code);
			const clientId = firstValue(params.client_id);
			const redirectUriValue = firstValue(params.redirect_uri);
			const codeVerifier = firstValue(params.code_verifier);

			deps.logger.info('Checking the received authorization code for the exchange');
			if (!code) {
				throw new InvalidGrantError('grant request is invalid');
			}

			const claim = await ephemeralStore.claimGrantCode(code);
			if (!claim) {
				throw new InvalidGrantError('grant request is invalid');
			}
			if (claim.status === 'reused') {
				deps.logger.info(
					`Detected multiple code use from ${claim.grant.clientId} for user ${claim.grant.userId}. Revoking the code.`,
				);
				if (claim.accessToken) await revokeAccessToken(claim.accessToken);
				throw new InvalidGrantError('grant request is invalid');
			}
			const granted = claim.grant;

			if (clientId !== granted.clientId || redirectUriValue !== granted.redirectUri) {
				throw new InvalidGrantError('grant request is invalid');
			}

			if (!codeVerifier) {
				throw new InvalidGrantError('grant request is invalid');
			}

			const challengeResult = verifyS256CodeChallenge(codeVerifier, granted.codeChallenge);
			if (!challengeResult) {
				throw new InvalidGrantError('grant request is invalid');
			}

			const accessToken = secureRndstr(128);
			const now = new Date();

			await createAccessToken(deps.db, {
				id: genId(now.getTime()),
				lastUsedAt: now,
				userId: granted.userId,
				token: accessToken,
				hash: accessToken,
				name: granted.clientId,
				permission: granted.scopes,
			});

			if ((await ephemeralStore.finalizeGrantCode(code, accessToken)) === 'revoked') {
				deps.logger.info('Canceling the token as the authorization code was revoked in parallel during the exchange.');
				await revokeAccessToken(accessToken);
				throw new InvalidGrantError('grant request is invalid');
			}

			deps.logger.info(
				`Generated access token for ${granted.clientId} for user ${granted.userId}, with scope: [${granted.scopes}]`,
			);

			return jsonResponse(
				{
					access_token: accessToken,
					token_type: 'Bearer',
					scope: granted.scopes.join(' '),
				},
				200,
				tokenCorsHeaders(),
			);
		} catch (error) {
			return oauthProviderErrorResponse(normalizeOAuthProviderError(error), tokenCorsHeaders());
		}
	}

	function unknownEndpoint(): Response {
		return jsonResponse(
			{
				error: {
					message: 'Unknown OAuth endpoint.',
					code: 'UNKNOWN_OAUTH_ENDPOINT',
					id: 'aa49e620-26cb-4e28-aad6-8cbcb58db147',
					kind: 'client',
				},
			},
			404,
			new Headers({
				'Content-Type': 'application/json; charset=utf-8',
			}),
		);
	}

	function tokenOptions(): Response {
		return new Response(null, {
			status: 204,
			headers: tokenCorsHeaders(),
		});
	}

	function dispose(): void {
		ephemeralStore.dispose();
	}

	return {
		authorize,
		decision,
		token,
		unknownEndpoint,
		tokenOptions,
		dispose,
	};
}
