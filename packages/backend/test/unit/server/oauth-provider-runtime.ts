/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env['NODE_ENV'] = 'test';

import * as htmlParser from 'node-html-parser';
import { describe, expect, test } from 'vitest';
import { createS256CodeChallenge } from '@/misc/pkce.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import {
	createMemoryOAuthEphemeralStore,
	createOAuthProviderRuntime,
	parseUrlEncodedParameters,
} from '@/server/oauth/OAuthProviderRuntime.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiLocalUser } from '@/models/User.js';
import type { CommonData } from '@/server/web/views/_.js';

const config = {
	instance: { url: 'http://misskey.local' },
	runtime: { host: 'misskey.local' },
} as Config;

const commonData = {
	version: 'test',
	config,
	langs: [],
	instanceName: 'Misskey',
	icon: null,
	appleTouchIcon: null,
	themeColor: null,
	serverErrorImageUrl: 'http://misskey.local/error.jpg',
	infoImageUrl: 'http://misskey.local/info.jpg',
	notFoundImageUrl: 'http://misskey.local/not-found.jpg',
	instanceUrl: config.instance.url,
	now: 0,
	federationEnabled: true,
	frontendViteFiles: null,
	frontendBootloaderJs: null,
	frontendBootloaderCss: null,
	frontendEmbedViteFiles: null,
	frontendEmbedBootloaderJs: null,
	frontendEmbedBootloaderCss: null,
	metaJson: '{}',
} satisfies CommonData;

function responseWithUrl(body: string, url: string): Response {
	const response = new Response(body, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
		},
	});
	Object.defineProperty(response, 'url', { value: url });
	return response;
}

describe('createOAuthProviderRuntime', () => {
	test('completes an authorization code flow', async () => {
		const clientId = 'http://client.example/';
		const redirectUri = 'http://client.example/callback';
		const createdTokens: unknown[] = [];
		const code_verifier = secureRndstr(128);
		const code_challenge = createS256CodeChallenge(code_verifier);
		const runtime = createOAuthProviderRuntime({
			config,
			db: {} as MiDrizzleDatabase,
			httpRequestService: {
				send: async (url) =>
					responseWithUrl(
						`
					<!doctype html>
					<link rel="redirect_uri" href="/callback">
					<div class="h-app"><a href="/" class="u-url p-name">Client App</a></div>
				`,
						url,
					),
			},
			getCommonData: async () => commonData,
			logger: {
				info: () => {},
				error: () => {},
			} as any,
			fetchLocalUserByNativeToken: async (token) =>
				token === 'login-token' ? ({ id: 'user-id' } as MiLocalUser) : null,
			createAccessToken: async (_db, values) => {
				createdTokens.push(values);
			},
		});

		const authorize = await runtime.authorize(
			parseUrlEncodedParameters(
				new URLSearchParams({
					response_type: 'code',
					client_id: clientId,
					redirect_uri: redirectUri,
					scope: 'write:notes',
					state: 'state',
					code_challenge,
					code_challenge_method: 'S256',
				}).toString(),
			),
		);

		expect(authorize.status).toBe(200);
		const doc = htmlParser.parse(await authorize.text());
		const transactionId = doc.querySelector('meta[name="misskey:oauth:transaction-id"]')?.attributes['content'];
		expect(transactionId).toBeTruthy();
		expect(doc.querySelector('meta[name="misskey:oauth:client-name"]')?.attributes['content']).toBe('Client App');

		const decision = await runtime.decision({
			transaction_id: transactionId,
			login_token: 'login-token',
		});

		expect(decision.status).toBe(302);
		const decisionLocation = new URL(decision.headers.get('location')!);
		const code = decisionLocation.searchParams.get('code');
		expect(decisionLocation.origin + decisionLocation.pathname).toBe(redirectUri);
		expect(decisionLocation.searchParams.get('state')).toBe('state');
		expect(decisionLocation.searchParams.get('iss')).toBe(config.instance.url);
		expect(code).toBeTruthy();

		const token = await runtime.token({
			grant_type: 'authorization_code',
			code: code!,
			client_id: clientId,
			redirect_uri: redirectUri,
			code_verifier,
		});

		expect(token.status).toBe(200);
		expect(token.headers.get('access-control-allow-origin')).toBe('*');
		const tokenBody = (await token.json()) as { access_token: string; token_type: string; scope: string };
		expect(tokenBody.token_type).toBe('Bearer');
		expect(tokenBody.scope).toBe('write:notes');
		expect(typeof tokenBody.access_token).toBe('string');
		expect(createdTokens).toMatchObject([
			{
				userId: 'user-id',
				token: tokenBody.access_token,
				hash: tokenBody.access_token,
				name: clientId,
				permission: ['write:notes'],
			},
		]);

		runtime.dispose();
	});

	test('rejects unknown token code', async () => {
		const runtime = createOAuthProviderRuntime({
			config,
			db: {} as MiDrizzleDatabase,
			httpRequestService: { send: async (url) => responseWithUrl('', url) },
			getCommonData: async () => commonData,
			logger: {
				info: () => {},
				error: () => {},
			} as any,
		});

		const response = await runtime.token({
			grant_type: 'authorization_code',
			code: 'missing',
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: 'invalid_grant' });
		runtime.dispose();
	});

	test('revokes a token when an authorization code is exchanged concurrently across runtimes', async () => {
		const clientId = 'http://client.example/';
		const redirectUri = 'http://client.example/callback';
		const codeVerifier = secureRndstr(128);
		const store = createMemoryOAuthEphemeralStore();
		const createdTokens: string[] = [];
		const deletedTokens: string[] = [];
		let deletionFailuresRemaining = 3;
		let releaseTokenCreation!: () => void;
		const tokenCreationBlocked = new Promise<void>((resolve) => {
			releaseTokenCreation = resolve;
		});
		let tokenCreationStarted!: () => void;
		const tokenCreationStart = new Promise<void>((resolve) => {
			tokenCreationStarted = resolve;
		});
		const dependencies = {
			config,
			db: {} as MiDrizzleDatabase,
			httpRequestService: {
				send: async (url: string) =>
					responseWithUrl(
						'<link rel="redirect_uri" href="/callback"><div class="h-app"><a href="/" class="u-url p-name">Client App</a></div>',
						url,
					),
			},
			getCommonData: async () => commonData,
			logger: { info: () => {}, error: () => {} } as any,
			ephemeralStore: store,
			fetchLocalUserByNativeToken: async () => ({ id: 'user-id' }) as MiLocalUser,
			createAccessToken: async (_db: MiDrizzleDatabase, values: { token: string }) => {
				createdTokens.push(values.token);
				tokenCreationStarted();
				await tokenCreationBlocked;
			},
			deleteAccessTokenByToken: async (_db: MiDrizzleDatabase, token: string) => {
				deletedTokens.push(token);
				if (deletionFailuresRemaining > 0) {
					deletionFailuresRemaining--;
					throw new Error('temporary database failure');
				}
			},
		};
		const first = createOAuthProviderRuntime(dependencies);
		const second = createOAuthProviderRuntime(dependencies);
		const authorize = await first.authorize({
			response_type: 'code',
			client_id: clientId,
			redirect_uri: redirectUri,
			scope: 'write:notes',
			code_challenge: createS256CodeChallenge(codeVerifier),
			code_challenge_method: 'S256',
		});
		const doc = htmlParser.parse(await authorize.text());
		const transactionId = doc.querySelector('meta[name="misskey:oauth:transaction-id"]')!.attributes['content'];
		const decision = await second.decision({ transaction_id: transactionId, login_token: 'login-token' });
		const code = new URL(decision.headers.get('location')!).searchParams.get('code')!;
		const request = {
			grant_type: 'authorization_code',
			code,
			client_id: clientId,
			redirect_uri: redirectUri,
			code_verifier: codeVerifier,
		};

		const firstResponsePromise = first.token(request);
		await tokenCreationStart;
		const secondResponse = await second.token(request);
		releaseTokenCreation();
		const firstResponse = await firstResponsePromise;

		expect([firstResponse.status, secondResponse.status]).toEqual([400, 400]);
		expect(((await firstResponse.json()) as { error: string }).error).toBe('temporarily_unavailable');
		expect(((await secondResponse.json()) as { error: string }).error).toBe('invalid_grant');
		expect(createdTokens).toHaveLength(1);

		const retryResponse = await first.token(request);
		expect(retryResponse.status).toBe(400);
		expect(((await retryResponse.json()) as { error: string }).error).toBe('invalid_grant');
		expect(deletedTokens).toEqual([createdTokens[0], createdTokens[0], createdTokens[0], createdTokens[0]]);
		store.dispose();
	});
});
