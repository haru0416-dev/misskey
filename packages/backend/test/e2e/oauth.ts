/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * OAuth ライブラリが Misskey に正しく統合され、依存関係の更新や実装変更で退行しないことを確認する。
 */

import * as assert from 'assert';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
	AuthorizationCode,
	type AuthorizationTokenConfig,
	ClientCredentials,
	ModuleOptions,
	ResourceOwnerPassword,
} from 'simple-oauth2';
import * as htmlParser from 'node-html-parser';
import { api, oauthClientPort, resolveTargetUrl, sendEnvUpdateRequest, signup } from '../utils.js';
import type * as misskey from 'misskey-js';
import { createS256CodeChallenge } from '@/misc/pkce.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';

const host = resolveTargetUrl('/').origin;

const clientPort = oauthClientPort;
const redirect_uri = `http://127.0.0.1:${clientPort}/redirect`;
const redirect_uri2 = `http://127.0.0.1:${clientPort}/redirect2`;

function pkceChallenge(_length = 128) {
	const code_verifier = secureRndstr(128);
	return {
		code_verifier,
		code_challenge: createS256CodeChallenge(code_verifier),
	};
}

type ClientMetadataReply = {
	header: (name: string, value: string) => ClientMetadataReply;
	send: (body?: unknown) => void;
};

function createClientMetadataReply(res: ServerResponse): ClientMetadataReply {
	const reply: ClientMetadataReply = {
		header(name, value) {
			if (!res.writableEnded) {
				res.setHeader(name, value);
			}
			return reply;
		},

		send(body) {
			if (res.writableEnded) return;

			if (body == null) {
				res.end();
				return;
			}

			if (typeof body === 'string' || Buffer.isBuffer(body)) {
				res.end(body);
				return;
			}

			if (!res.hasHeader('content-type')) {
				res.setHeader('content-type', 'application/json');
			}
			res.end(JSON.stringify(body));
		},
	};

	return reply;
}

async function listen(server: Server, port: number): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(port, '127.0.0.1', () => {
			server.off('error', reject);
			resolve();
		});
	});
}

async function close(server: Server): Promise<void> {
	if (!server.listening) return;

	await new Promise<void>((resolve, reject) => {
		server.close((err) => (err ? reject(err) : resolve()));
	});
}

const basicAuthParams: AuthorizationParamsExtended = {
	redirect_uri,
	scope: 'write:notes',
	state: 'state',
	code_challenge: 'code',
	code_challenge_method: 'S256',
};

interface AuthorizationParamsExtended {
	redirect_uri: string;
	scope: string | string[];
	state: string;
	code_challenge?: string;
	code_challenge_method?: string;
}

interface AuthorizationTokenConfigExtended extends AuthorizationTokenConfig {
	code_verifier: string | undefined;
}

interface GetTokenError {
	data: {
		payload: {
			error: string;
		};
	};
}

const clientConfig: ModuleOptions<'client_id'> = {
	client: {
		id: `http://127.0.0.1:${clientPort}/`,
		secret: '',
	},
	auth: {
		tokenHost: host,
		tokenPath: '/oauth/token',
		authorizePath: '/oauth/authorize',
	},
	options: {
		authorizationMethod: 'body',
	},
};

function getMeta(html: string): {
	transactionId: string | undefined;
	clientName: string | undefined;
	clientLogo: string | undefined;
} {
	const doc = htmlParser.parse(`<div>${html}</div>`);
	return {
		transactionId: doc.querySelector('meta[name="misskey:oauth:transaction-id"]')?.attributes['content'],
		clientName: doc.querySelector('meta[name="misskey:oauth:client-name"]')?.attributes['content'],
		clientLogo: doc.querySelector('meta[name="misskey:oauth:client-logo"]')?.attributes['content'],
	};
}

function fetchDecision(
	transactionId: string,
	user: misskey.entities.SignupResponse,
	{ cancel }: { cancel?: boolean } = {},
): Promise<Response> {
	return fetch(new URL('/oauth/decision', host), {
		method: 'post',
		body: new URLSearchParams({
			transaction_id: transactionId,
			login_token: user.token,
			cancel: cancel ? 'cancel' : '',
		}),
		redirect: 'manual',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
		},
	});
}

async function fetchDecisionFromResponse(
	response: Response,
	user: misskey.entities.SignupResponse,
	{ cancel }: { cancel?: boolean } = {},
): Promise<Response> {
	const { transactionId } = getMeta(await response.text());
	assert.ok(transactionId);

	return await fetchDecision(transactionId, user, cancel === undefined ? {} : { cancel });
}

async function fetchAuthorizationCode(
	user: misskey.entities.SignupResponse,
	scope: string,
	code_challenge: string,
): Promise<{ client: AuthorizationCode; code: string }> {
	const client = new AuthorizationCode(clientConfig);

	const response = await fetch(
		client.authorizeURL({
			redirect_uri,
			scope,
			state: 'state',
			code_challenge,
			code_challenge_method: 'S256',
		} as AuthorizationParamsExtended),
	);
	expect(response.status).toBe(200);

	const decisionResponse = await fetchDecisionFromResponse(response, user);
	expect(decisionResponse.status).toBe(302);

	const locationHeader = decisionResponse.headers.get('location');
	assert.ok(locationHeader);

	const location = new URL(locationHeader);
	assert.ok(location.searchParams.has('code'));

	const code = new URL(location).searchParams.get('code');
	assert.ok(code);

	return { client, code };
}

function assertIndirectError(response: Response, error: string): void {
	expect(response.status).toBe(302);

	const locationHeader = response.headers.get('location');
	assert.ok(locationHeader);

	const location = new URL(locationHeader);
	expect(location.searchParams.get('error')).toBe(error);

	// https://datatracker.ietf.org/doc/html/rfc9207#name-response-parameter-iss
	expect(location.searchParams.get('iss')).toBe('http://misskey.local');
	// https://datatracker.ietf.org/doc/html/rfc6749.html#section-4.1.2.1
	assert.ok(location.searchParams.has('state'));
}

async function assertDirectError(response: Response, status: number, error: string): Promise<void> {
	expect(response.status).toBe(status);

	const data = (await response.json()) as any;
	expect(data.error).toBe(error);
}

describe('OAuth', () => {
	let clientServer: Server;

	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;

	let sender: (reply: ClientMetadataReply) => void;

	beforeAll(
		async () => {
			alice = await signup({ username: 'alice' });
			bob = await signup({ username: 'bob' });

			clientServer = createServer((_request, response) => {
				try {
					sender(createClientMetadataReply(response));
				} catch (err) {
					response.statusCode = 500;
					response.end(err instanceof Error ? err.message : String(err));
				}
			});
			await listen(clientServer, clientPort);
		},
		1000 * 60 * 2,
	);

	beforeEach(async () => {
		await sendEnvUpdateRequest({ key: 'MISSKEY_TEST_CHECK_IP_RANGE', value: '' });
		sender = (reply): void => {
			reply.send(`
				<!DOCTYPE html>
				<link rel="redirect_uri" href="/redirect" />
				<div class="h-app"><a href="/" class="u-url p-name">Misklient
			`);
		};
	});

	afterAll(async () => {
		await close(clientServer);
	});

	test('Full flow', async () => {
		const { code_challenge, code_verifier } = await pkceChallenge(128);

		const client = new AuthorizationCode(clientConfig);

		const response = await fetch(
			client.authorizeURL({
				redirect_uri,
				scope: 'write:notes',
				state: 'state',
				code_challenge,
				code_challenge_method: 'S256',
			} as AuthorizationParamsExtended),
		);
		expect(response.status).toBe(200);

		const meta = getMeta(await response.text());
		expect(typeof meta.transactionId).toBe('string');
		assert.ok(meta.transactionId);
		expect(meta.clientName).toBe('Misklient');

		const decisionResponse = await fetchDecision(meta.transactionId, alice);
		expect(decisionResponse.status).toBe(302);
		assert.ok(decisionResponse.headers.has('location'));

		const locationHeader = decisionResponse.headers.get('location');
		assert.ok(locationHeader);

		const location = new URL(locationHeader);
		expect(location.origin + location.pathname).toBe(redirect_uri);
		assert.ok(location.searchParams.has('code'));
		expect(location.searchParams.get('state')).toBe('state');
		// https://datatracker.ietf.org/doc/html/rfc9207#name-response-parameter-iss
		expect(location.searchParams.get('iss')).toBe('http://misskey.local');

		const code = new URL(location).searchParams.get('code');
		assert.ok(code);

		const token = await client.getToken({
			code,
			redirect_uri,
			code_verifier,
		} as AuthorizationTokenConfigExtended);
		expect(typeof token.token['access_token']).toBe('string');
		expect(token.token['token_type']).toBe('Bearer');
		expect(token.token['scope']).toBe('write:notes');

		const createResult = await api(
			'notes/create',
			{ text: 'test' },
			{
				token: token.token['access_token'] as string,
				bearer: true,
			},
		);
		expect(createResult.status).toBe(200);

		const createResultBody = createResult.body as misskey.Endpoints['notes/create']['res'];
		expect(createResultBody.createdNote.text).toBe('test');
	});

	test('Two concurrent flows', async () => {
		const client = new AuthorizationCode(clientConfig);

		const pkceAlice = await pkceChallenge(128);
		const pkceBob = await pkceChallenge(128);

		const responseAlice = await fetch(
			client.authorizeURL({
				redirect_uri,
				scope: 'write:notes',
				state: 'state',
				code_challenge: pkceAlice.code_challenge,
				code_challenge_method: 'S256',
			} as AuthorizationParamsExtended),
		);
		expect(responseAlice.status).toBe(200);

		const responseBob = await fetch(
			client.authorizeURL({
				redirect_uri,
				scope: 'write:notes',
				state: 'state',
				code_challenge: pkceBob.code_challenge,
				code_challenge_method: 'S256',
			} as AuthorizationParamsExtended),
		);
		expect(responseBob.status).toBe(200);

		const decisionResponseAlice = await fetchDecisionFromResponse(responseAlice, alice);
		expect(decisionResponseAlice.status).toBe(302);

		const decisionResponseBob = await fetchDecisionFromResponse(responseBob, bob);
		expect(decisionResponseBob.status).toBe(302);

		const locationHeaderAlice = decisionResponseAlice.headers.get('location');
		assert.ok(locationHeaderAlice);
		const locationAlice = new URL(locationHeaderAlice);

		const locationHeaderBob = decisionResponseBob.headers.get('location');
		assert.ok(locationHeaderBob);
		const locationBob = new URL(locationHeaderBob);

		const codeAlice = locationAlice.searchParams.get('code');
		assert.ok(codeAlice);
		const codeBob = locationBob.searchParams.get('code');
		assert.ok(codeBob);

		const tokenAlice = await client.getToken({
			code: codeAlice,
			redirect_uri,
			code_verifier: pkceAlice.code_verifier,
		} as AuthorizationTokenConfigExtended);

		const tokenBob = await client.getToken({
			code: codeBob,
			redirect_uri,
			code_verifier: pkceBob.code_verifier,
		} as AuthorizationTokenConfigExtended);

		const createResultAlice = await api(
			'notes/create',
			{ text: 'test' },
			{
				token: tokenAlice.token['access_token'] as string,
				bearer: true,
			},
		);
		expect(createResultAlice.status).toBe(200);

		const createResultBob = await api(
			'notes/create',
			{ text: 'test' },
			{
				token: tokenBob.token['access_token'] as string,
				bearer: true,
			},
		);
		expect(createResultAlice.status).toBe(200);

		const createResultBodyAlice = (await createResultAlice.body) as misskey.Endpoints['notes/create']['res'];
		expect(createResultBodyAlice.createdNote.user.username).toBe('alice');

		const createResultBodyBob = (await createResultBob.body) as misskey.Endpoints['notes/create']['res'];
		expect(createResultBodyBob.createdNote.user.username).toBe('bob');
	});

	// https://datatracker.ietf.org/doc/html/rfc7636.html
	describe('PKCE', () => {
		// https://datatracker.ietf.org/doc/html/rfc7636.html#section-4.4.1
		// authorization endpoint は error に invalid_request を設定したエラー応答を返す。
		test('Require PKCE', async () => {
			const client = new AuthorizationCode(clientConfig);

			let response = await fetch(
				client.authorizeURL({
					redirect_uri,
					scope: 'write:notes',
					state: 'state',
				}),
				{ redirect: 'manual' },
			);
			assertIndirectError(response, 'invalid_request');

			response = await fetch(
				client.authorizeURL({
					redirect_uri,
					scope: 'write:notes',
					state: 'state',
					code_challenge: 'code',
				} as AuthorizationParamsExtended),
				{ redirect: 'manual' },
			);
			assertIndirectError(response, 'invalid_request');

			response = await fetch(
				client.authorizeURL({
					redirect_uri,
					scope: 'write:notes',
					state: 'state',
					code_challenge_method: 'S256',
				} as AuthorizationParamsExtended),
				{ redirect: 'manual' },
			);
			assertIndirectError(response, 'invalid_request');

			response = await fetch(
				client.authorizeURL({
					redirect_uri,
					scope: 'write:notes',
					state: 'state',
					code_challenge: 'code',
					code_challenge_method: 'SSSS',
				} as AuthorizationParamsExtended),
				{ redirect: 'manual' },
			);
			assertIndirectError(response, 'invalid_request');
		});

		// テスト結果を決定的にするため、事前計算した challenge/verifier を使う。
		const code_challenge =
			'4w2GDuvaxXlw2l46k5PFIoIcTGHdzw2i3hrn-C_Q6f7u0-nTYKd-beVEYy9XinYsGtAix.Nnvr.GByD3lAii2ibPRsSDrZgIN0YQb.kfevcfR9aDKoTLyOUm4hW4ABhs';
		const code_verifier = 'Ew8VSBiH59JirLlg7ocFpLQ6NXuFC1W_rn8gmRzBKc8';

		const tests: Record<string, string | undefined> = {
			'Code followed by some junk code': code_verifier + 'x',
			'Clipped code': code_verifier.slice(0, 80),
			'Some part of code is replaced': code_verifier.slice(0, -10) + 'x'.repeat(10),
			'No verifier': undefined,
		};

		describe('Verify PKCE', () => {
			for (const [title, wrong_verifier] of Object.entries(tests)) {
				test(title, async () => {
					const { client, code } = await fetchAuthorizationCode(alice, 'write:notes', code_challenge);

					await expect(
						client.getToken({
							code,
							redirect_uri,
							code_verifier: wrong_verifier,
						} as AuthorizationTokenConfigExtended),
					).rejects.toSatisfy((err: GetTokenError) => {
						expect(err.data.payload.error).toBe('invalid_grant');
						return true;
					});
				});
			}
		});
	});

	// https://datatracker.ietf.org/doc/html/rfc6749.html#section-4.1.2
	// 認可コードが複数回使われた場合、要求を拒否し、可能ならそのコードに基づく発行済みトークンを失効させる。
	describe('Revoking authorization code', () => {
		test('On success', async () => {
			const { code_challenge, code_verifier } = await pkceChallenge(128);
			const { client, code } = await fetchAuthorizationCode(alice, 'write:notes', code_challenge);

			await client.getToken({
				code,
				redirect_uri,
				code_verifier,
			} as AuthorizationTokenConfigExtended);

			await expect(
				client.getToken({
					code,
					redirect_uri,
					code_verifier,
				} as AuthorizationTokenConfigExtended),
			).rejects.toSatisfy((err: GetTokenError) => {
				expect(err.data.payload.error).toBe('invalid_grant');
				return true;
			});
		});

		test('On failure', async () => {
			const { code_challenge, code_verifier } = await pkceChallenge(128);
			const { client, code } = await fetchAuthorizationCode(alice, 'write:notes', code_challenge);

			await expect(client.getToken({ code, redirect_uri })).rejects.toSatisfy((err: GetTokenError) => {
				expect(err.data.payload.error).toBe('invalid_grant');
				return true;
			});

			await expect(
				client.getToken({
					code,
					redirect_uri,
					code_verifier,
				} as AuthorizationTokenConfigExtended),
			).rejects.toSatisfy((err: GetTokenError) => {
				expect(err.data.payload.error).toBe('invalid_grant');
				return true;
			});
		});

		test('Revoke the already granted access token', async () => {
			const { code_challenge, code_verifier } = await pkceChallenge(128);
			const { client, code } = await fetchAuthorizationCode(alice, 'write:notes', code_challenge);

			const token = await client.getToken({
				code,
				redirect_uri,
				code_verifier,
			} as AuthorizationTokenConfigExtended);

			const createResult = await api(
				'notes/create',
				{ text: 'test' },
				{
					token: token.token['access_token'] as string,
					bearer: true,
				},
			);
			expect(createResult.status).toBe(200);

			await expect(
				client.getToken({
					code,
					redirect_uri,
					code_verifier,
				} as AuthorizationTokenConfigExtended),
			).rejects.toSatisfy((err: GetTokenError) => {
				expect(err.data.payload.error).toBe('invalid_grant');
				return true;
			});

			const createResult2 = await api(
				'notes/create',
				{ text: 'test' },
				{
					token: token.token['access_token'] as string,
					bearer: true,
				},
			);
			expect(createResult2.status).toBe(401);
		});

		test('Concurrent exchanges do not leave a usable access token', async () => {
			const { code_challenge, code_verifier } = await pkceChallenge(128);
			const { client, code } = await fetchAuthorizationCode(alice, 'write:notes', code_challenge);
			const exchange = () =>
				client.getToken({
					code,
					redirect_uri,
					code_verifier,
				} as AuthorizationTokenConfigExtended);

			const results = await Promise.allSettled([exchange(), exchange()]);
			const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
			assert.ok(rejected.length >= 1);
			for (const result of rejected) {
				expect((result.reason as GetTokenError).data.payload.error).toBe('invalid_grant');
			}

			for (const result of results) {
				if (result.status !== 'fulfilled') continue;
				const createResult = await api(
					'notes/create',
					{ text: 'test' },
					{
						token: result.value.token['access_token'] as string,
						bearer: true,
					},
				);
				expect(createResult.status).toBe(401);
			}
		});
	});

	test('Cancellation', async () => {
		const client = new AuthorizationCode(clientConfig);

		const response = await fetch(
			client.authorizeURL({
				redirect_uri,
				scope: 'write:notes',
				state: 'state',
				code_challenge: 'code',
				code_challenge_method: 'S256',
			} as AuthorizationParamsExtended),
		);
		expect(response.status).toBe(200);

		const decisionResponse = await fetchDecisionFromResponse(response, alice, { cancel: true });
		expect(decisionResponse.status).toBe(302);

		const locationHeader = decisionResponse.headers.get('location');
		assert.ok(locationHeader);

		const location = new URL(locationHeader);
		assert.ok(!location.searchParams.has('code'));
		assert.ok(location.searchParams.has('error'));
	});

	// https://datatracker.ietf.org/doc/html/rfc6749.html#section-3.3
	describe('Scope', () => {
		// scope が省略された場合、既定値で処理するか invalid_scope を示して失敗させる。
		test('Missing scope', async () => {
			const client = new AuthorizationCode(clientConfig);

			const response = await fetch(
				client.authorizeURL({
					redirect_uri,
					state: 'state',
					code_challenge: 'code',
					code_challenge_method: 'S256',
				} as AuthorizationParamsExtended),
				{ redirect: 'manual' },
			);
			assertIndirectError(response, 'invalid_scope');
		});

		test('Empty scope', async () => {
			const client = new AuthorizationCode(clientConfig);

			const response = await fetch(
				client.authorizeURL({
					redirect_uri,
					scope: '',
					state: 'state',
					code_challenge: 'code',
					code_challenge_method: 'S256',
				} as AuthorizationParamsExtended),
				{ redirect: 'manual' },
			);
			assertIndirectError(response, 'invalid_scope');
		});

		test('Unknown scopes', async () => {
			const client = new AuthorizationCode(clientConfig);

			const response = await fetch(
				client.authorizeURL({
					redirect_uri,
					scope: 'test:unknown test:unknown2',
					state: 'state',
					code_challenge: 'code',
					code_challenge_method: 'S256',
				} as AuthorizationParamsExtended),
				{ redirect: 'manual' },
			);
			assertIndirectError(response, 'invalid_scope');
		});

		// 要求と異なる scope を認可した場合、実際に付与した scope を response parameter で通知する。
		test('Partially known scopes', async () => {
			const { code_challenge, code_verifier } = await pkceChallenge(128);

			// このケースでは既知の scope だけを取得する。
			const { client, code } = await fetchAuthorizationCode(
				alice,
				'write:notes test:unknown test:unknown2',
				code_challenge,
			);

			const token = await client.getToken({
				code,
				redirect_uri,
				code_verifier,
			} as AuthorizationTokenConfigExtended);

			expect(token.token['scope']).toBe('write:notes');
		});

		test('Known scopes', async () => {
			const client = new AuthorizationCode(clientConfig);

			const response = await fetch(
				client.authorizeURL({
					redirect_uri,
					scope: 'write:notes read:account',
					state: 'state',
					code_challenge: 'code',
					code_challenge_method: 'S256',
				} as AuthorizationParamsExtended),
			);

			expect(response.status).toBe(200);
		});

		test('Duplicated scopes', async () => {
			const { code_challenge, code_verifier } = await pkceChallenge(128);

			const { client, code } = await fetchAuthorizationCode(
				alice,
				'write:notes write:notes read:account read:account',
				code_challenge,
			);

			const token = await client.getToken({
				code,
				redirect_uri,
				code_verifier,
			} as AuthorizationTokenConfigExtended);
			expect(token.token['scope']).toBe('write:notes read:account');
		});

		test('Scope check by API', async () => {
			const { code_challenge, code_verifier } = await pkceChallenge(128);

			const { client, code } = await fetchAuthorizationCode(alice, 'read:account', code_challenge);

			const token = await client.getToken({
				code,
				redirect_uri,
				code_verifier,
			} as AuthorizationTokenConfigExtended);
			expect(typeof token.token['access_token']).toBe('string');

			const createResult = await api(
				'notes/create',
				{ text: 'test' },
				{
					token: token.token['access_token'] as string,
					bearer: true,
				},
			);
			expect(createResult.status).toBe(403);
			assert.ok(
				createResult.headers
					.get('WWW-Authenticate')
					?.startsWith('Bearer realm="Misskey", error="insufficient_scope", error_description'),
			);
		});
	});

	// https://datatracker.ietf.org/doc/html/rfc6749.html#section-3.1.2.4
	// redirection URI がない、無効、または不一致の場合はエラーを通知し、無効な URI へ自動リダイレクトしない。
	describe('Redirection', () => {
		test('Invalid redirect_uri at authorization endpoint', async () => {
			const client = new AuthorizationCode(clientConfig);

			const response = await fetch(
				client.authorizeURL({
					redirect_uri: 'http://127.0.0.2/',
					scope: 'write:notes',
					state: 'state',
					code_challenge: 'code',
					code_challenge_method: 'S256',
				} as AuthorizationParamsExtended),
			);
			await assertDirectError(response, 400, 'invalid_request');
		});

		test('Invalid redirect_uri including the valid one at authorization endpoint', async () => {
			const client = new AuthorizationCode(clientConfig);

			const response = await fetch(
				client.authorizeURL({
					redirect_uri: 'http://127.0.0.1/redirection',
					scope: 'write:notes',
					state: 'state',
					code_challenge: 'code',
					code_challenge_method: 'S256',
				} as AuthorizationParamsExtended),
			);
			await assertDirectError(response, 400, 'invalid_request');
		});

		test('No redirect_uri at authorization endpoint', async () => {
			const client = new AuthorizationCode(clientConfig);

			const response = await fetch(
				client.authorizeURL({
					scope: 'write:notes',
					state: 'state',
					code_challenge: 'code',
					code_challenge_method: 'S256',
				} as AuthorizationParamsExtended),
			);
			await assertDirectError(response, 400, 'invalid_request');
		});

		test('Invalid redirect_uri at token endpoint', async () => {
			const { code_challenge, code_verifier } = await pkceChallenge(128);

			const { client, code } = await fetchAuthorizationCode(alice, 'write:notes', code_challenge);

			await expect(
				client.getToken({
					code,
					redirect_uri: 'http://127.0.0.2/',
					code_verifier,
				} as AuthorizationTokenConfigExtended),
			).rejects.toSatisfy((err: GetTokenError) => {
				expect(err.data.payload.error).toBe('invalid_grant');
				return true;
			});
		});

		test('Invalid redirect_uri including the valid one at token endpoint', async () => {
			const { code_challenge, code_verifier } = await pkceChallenge(128);

			const { client, code } = await fetchAuthorizationCode(alice, 'write:notes', code_challenge);

			await expect(
				client.getToken({
					code,
					redirect_uri: 'http://127.0.0.1/redirection',
					code_verifier,
				} as AuthorizationTokenConfigExtended),
			).rejects.toSatisfy((err: GetTokenError) => {
				expect(err.data.payload.error).toBe('invalid_grant');
				return true;
			});
		});

		test('No redirect_uri at token endpoint', async () => {
			const { code_challenge, code_verifier } = await pkceChallenge(128);

			const { client, code } = await fetchAuthorizationCode(alice, 'write:notes', code_challenge);

			await expect(
				client.getToken({
					code,
					code_verifier,
				} as AuthorizationTokenConfigExtended),
			).rejects.toSatisfy((err: GetTokenError) => {
				expect(err.data.payload.error).toBe('invalid_grant');
				return true;
			});
		});
	});

	// https://datatracker.ietf.org/doc/html/rfc8414
	test('Server metadata', async () => {
		const response = await fetch(new URL('.well-known/oauth-authorization-server', host));
		expect(response.status).toBe(200);

		const body = (await response.json()) as any;
		expect(body.issuer).toBe('http://misskey.local');
		assert.ok(body.scopes_supported.includes('write:notes'));
	});

	// decision endpoint のエラーは Misskey 側のエラーであり、クライアントには依存しないため direct error を使う。
	describe('Decision endpoint', () => {
		test('No login token', async () => {
			const client = new AuthorizationCode(clientConfig);

			const response = await fetch(client.authorizeURL(basicAuthParams));
			expect(response.status).toBe(200);

			const { transactionId } = getMeta(await response.text());
			assert.ok(transactionId);

			const decisionResponse = await fetch(new URL('/oauth/decision', host), {
				method: 'post',
				body: new URLSearchParams({
					transaction_id: transactionId,
				}),
				redirect: 'manual',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
				},
			});
			await assertDirectError(decisionResponse, 400, 'invalid_request');
		});

		test('No transaction ID', async () => {
			const decisionResponse = await fetch(new URL('/oauth/decision', host), {
				method: 'post',
				body: new URLSearchParams({
					login_token: alice.token,
				}),
				redirect: 'manual',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
				},
			});
			await assertDirectError(decisionResponse, 400, 'invalid_request');
		});

		test('Invalid transaction ID', async () => {
			const decisionResponse = await fetch(new URL('/oauth/decision', host), {
				method: 'post',
				body: new URLSearchParams({
					login_token: alice.token,
					transaction_id: 'invalid_id',
				}),
				redirect: 'manual',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
				},
			});
			await assertDirectError(decisionResponse, 403, 'access_denied');
		});
	});

	// 対応する grant type は authorization code のみ。
	describe('Grant type', () => {
		test('Implicit grant is not supported', async () => {
			const url = new URL('/oauth/authorize', host);
			url.searchParams.append('response_type', 'token');
			const response = await fetch(url);
			assertDirectError(response, 501, 'unsupported_response_type');
		});

		test('Resource owner grant is not supported', async () => {
			const client = new ResourceOwnerPassword({
				...clientConfig,
				auth: {
					tokenHost: host,
					tokenPath: '/oauth/token',
				},
			});

			await expect(
				client.getToken({
					username: 'alice',
					password: 'test',
				}),
			).rejects.toSatisfy((err: GetTokenError) => {
				expect(err.data.payload.error).toBe('unsupported_grant_type');
				return true;
			});
		});

		test('Client credential grant is not supported', async () => {
			const client = new ClientCredentials({
				...clientConfig,
				auth: {
					tokenHost: host,
					tokenPath: '/oauth/token',
				},
			});

			await expect(client.getToken({})).rejects.toSatisfy((err: GetTokenError) => {
				expect(err.data.payload.error).toBe('unsupported_grant_type');
				return true;
			});
		});
	});

	describe('Token endpoint', () => {
		test('Accept JSON payload', async () => {
			const { code_challenge, code_verifier } = await pkceChallenge(128);
			const { code } = await fetchAuthorizationCode(alice, 'write:notes', code_challenge);

			const response = await fetch(new URL('/oauth/token', host), {
				method: 'post',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					grant_type: 'authorization_code',
					code,
					client_id: clientConfig.client.id,
					redirect_uri,
					code_verifier,
				}),
			});

			expect(response.status).toBe(200);
			const tokenResponse = (await response.json()) as {
				access_token: string;
				token_type: string;
				scope: string;
			};
			expect(typeof tokenResponse.access_token).toBe('string');
			expect(tokenResponse.token_type).toBe('Bearer');
			expect(tokenResponse.scope).toBe('write:notes');
		});

		test('Accept x-www-form-urlencoded payload', async () => {
			const { code_challenge, code_verifier } = await pkceChallenge(128);
			const { code } = await fetchAuthorizationCode(alice, 'write:notes', code_challenge);

			const response = await fetch(new URL('/oauth/token', host), {
				method: 'post',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({
					grant_type: 'authorization_code',
					code,
					client_id: clientConfig.client.id,
					redirect_uri,
					code_verifier,
				}),
			});

			expect(response.status).toBe(200);
			const tokenResponse = (await response.json()) as {
				access_token: string;
				token_type: string;
				scope: string;
			};
			expect(typeof tokenResponse.access_token).toBe('string');
			expect(tokenResponse.token_type).toBe('Bearer');
			expect(tokenResponse.scope).toBe('write:notes');
		});
	});

	describe('Client Information Discovery', () => {
		// https://indieauth.spec.indieweb.org/#client-information-discovery
		describe('JSON client metadata (11 July 2024)', () => {
			test('Read JSON document', async () => {
				sender = (reply): void => {
					reply.header('content-type', 'application/json');
					reply.send({
						client_id: `http://127.0.0.1:${clientPort}/`,
						client_uri: `http://127.0.0.1:${clientPort}/`,
						client_name: 'Misklient JSON',
						logo_uri: '/logo.png',
						redirect_uris: ['/redirect'],
					});
				};

				const client = new AuthorizationCode(clientConfig);

				const response = await fetch(
					client.authorizeURL({
						redirect_uri,
						scope: 'write:notes',
						state: 'state',
						code_challenge: 'code',
						code_challenge_method: 'S256',
					} as AuthorizationParamsExtended),
				);
				expect(response.status).toBe(200);
				const meta = getMeta(await response.text());
				expect(meta.clientName).toBe('Misklient JSON');
				expect(meta.clientLogo).toBe(`http://127.0.0.1:${clientPort}/logo.png`);
			});

			test('Merge Link header redirect_uri with JSON redirect_uris', async () => {
				sender = (reply): void => {
					reply.header('Link', '</redirect2>; rel="redirect_uri"');
					reply.header('content-type', 'application/json');
					reply.send({
						client_id: `http://127.0.0.1:${clientPort}/`,
						client_uri: `http://127.0.0.1:${clientPort}/`,
						client_name: 'Misklient JSON',
						redirect_uris: ['/redirect'],
					});
				};

				const client = new AuthorizationCode(clientConfig);

				const ok1 = await fetch(
					client.authorizeURL({
						redirect_uri,
						scope: 'write:notes',
						state: 'state',
						code_challenge: 'code',
						code_challenge_method: 'S256',
					} as AuthorizationParamsExtended),
				);
				expect(ok1.status).toBe(200);

				const ok2 = await fetch(
					client.authorizeURL({
						redirect_uri: redirect_uri2,
						scope: 'write:notes',
						state: 'state',
						code_challenge: 'code',
						code_challenge_method: 'S256',
					} as AuthorizationParamsExtended),
				);
				expect(ok2.status).toBe(200);
			});

			test('Reject when client_id does not match retrieved URL', async () => {
				sender = (reply): void => {
					reply.header('content-type', 'application/json');
					reply.send({
						client_id: `http://127.0.0.1:${clientPort}/mismatch`,
						client_uri: `http://127.0.0.1:${clientPort}/`,
						redirect_uris: ['/redirect'],
					});
				};

				const client = new AuthorizationCode(clientConfig);
				const response = await fetch(
					client.authorizeURL({
						redirect_uri,
						scope: 'write:notes',
						state: 'state',
						code_challenge: 'code',
						code_challenge_method: 'S256',
					} as AuthorizationParamsExtended),
				);
				await assertDirectError(response, 400, 'invalid_request');
			});

			test('Reject when client_uri is not a prefix of client_id', async () => {
				sender = (reply): void => {
					reply.header('content-type', 'application/json');
					reply.send({
						client_id: `http://127.0.0.1:${clientPort}/`,
						client_uri: `http://127.0.0.1:${clientPort}/no-prefix/`,
						redirect_uris: ['/redirect'],
					});
				};

				const client = new AuthorizationCode(clientConfig);
				const response = await fetch(
					client.authorizeURL({
						redirect_uri,
						scope: 'write:notes',
						state: 'state',
						code_challenge: 'code',
						code_challenge_method: 'S256',
					} as AuthorizationParamsExtended),
				);
				await assertDirectError(response, 400, 'invalid_request');
			});

			test('Reject when JSON metadata has no redirect_uris and no Link header', async () => {
				sender = (reply): void => {
					reply.header('content-type', 'application/json');
					reply.send({
						client_id: `http://127.0.0.1:${clientPort}/`,
						client_uri: `http://127.0.0.1:${clientPort}/`,
						client_name: 'Misklient JSON',
					});
				};

				const client = new AuthorizationCode(clientConfig);
				const response = await fetch(
					client.authorizeURL({
						redirect_uri,
						scope: 'write:notes',
						state: 'state',
						code_challenge: 'code',
						code_challenge_method: 'S256',
					} as AuthorizationParamsExtended),
				);
				await assertDirectError(response, 400, 'invalid_request');
			});
		});

		// https://indieauth.spec.indieweb.org/20220212/#client-information-discovery
		describe('HTML link client metadata (12 Feb 2022)', () => {
			describe('Redirection', () => {
				const tests: Record<string, (reply: ClientMetadataReply) => void> = {
					'Read HTTP header': (reply) => {
						reply.header('Link', '</redirect>; rel="redirect_uri"');
						reply.send(`
							<!DOCTYPE html>
							<div class="h-app"><a href="/" class="u-url p-name">Misklient
						`);
					},
					'Mixed links': (reply) => {
						reply.header('Link', '</redirect>; rel="redirect_uri"');
						reply.send(`
							<!DOCTYPE html>
							<link rel="redirect_uri" href="/redirect2" />
							<div class="h-app"><a href="/" class="u-url p-name">Misklient
						`);
					},
					'Multiple items in Link header': (reply) => {
						reply.header('Link', '</redirect2>; rel="redirect_uri",</redirect>; rel="redirect_uri"');
						reply.send(`
							<!DOCTYPE html>
							<div class="h-app"><a href="/" class="u-url p-name">Misklient
						`);
					},
					'Multiple items in HTML': (reply) => {
						reply.send(`
							<!DOCTYPE html>
							<link rel="redirect_uri" href="/redirect2" />
							<link rel="redirect_uri" href="/redirect" />
							<div class="h-app"><a href="/" class="u-url p-name">Misklient
						`);
					},
				};

				for (const [title, replyFunc] of Object.entries(tests)) {
					test(title, async () => {
						sender = replyFunc;

						const client = new AuthorizationCode(clientConfig);

						const response = await fetch(
							client.authorizeURL({
								redirect_uri,
								scope: 'write:notes',
								state: 'state',
								code_challenge: 'code',
								code_challenge_method: 'S256',
							} as AuthorizationParamsExtended),
						);
						expect(response.status).toBe(200);
					});
				}

				test('No item', async () => {
					sender = (reply): void => {
						reply.send(`
							<!DOCTYPE html>
							<div class="h-app"><a href="/" class="u-url p-name">Misklient
						`);
					};

					const client = new AuthorizationCode(clientConfig);

					const response = await fetch(
						client.authorizeURL({
							redirect_uri,
							scope: 'write:notes',
							state: 'state',
							code_challenge: 'code',
							code_challenge_method: 'S256',
						} as AuthorizationParamsExtended),
					);

					// リダイレクト先がないため direct error を返す。
					await assertDirectError(response, 400, 'invalid_request');
				});
			});

			test('Disallow loopback', async () => {
				await sendEnvUpdateRequest({ key: 'MISSKEY_TEST_CHECK_IP_RANGE', value: '1' });

				const client = new AuthorizationCode(clientConfig);
				const response = await fetch(
					client.authorizeURL({
						redirect_uri,
						scope: 'write:notes',
						state: 'state',
						code_challenge: 'code',
						code_challenge_method: 'S256',
					} as AuthorizationParamsExtended),
				);
				await assertDirectError(response, 400, 'invalid_request');
			});

			test('Missing name', async () => {
				sender = (reply): void => {
					reply.header('Link', '</redirect>; rel="redirect_uri"');
					reply.send();
				};

				const client = new AuthorizationCode(clientConfig);

				const response = await fetch(
					client.authorizeURL({
						redirect_uri,
						scope: 'write:notes',
						state: 'state',
						code_challenge: 'code',
						code_challenge_method: 'S256',
					} as AuthorizationParamsExtended),
				);
				expect(response.status).toBe(200);
				expect(getMeta(await response.text()).clientName).toBe(`http://127.0.0.1:${clientPort}/`);
			});

			test('With Logo', async () => {
				sender = (reply): void => {
					reply.header('Link', '</redirect>; rel="redirect_uri"');
					reply.send(`
						<!DOCTYPE html>
						<div class="h-app">
							<a href="/" class="u-url p-name">Misklient</a>
							<img src="/logo.png" class="u-logo" />
						</div>
					`);
					reply.send();
				};

				const client = new AuthorizationCode(clientConfig);

				const response = await fetch(
					client.authorizeURL({
						redirect_uri,
						scope: 'write:notes',
						state: 'state',
						code_challenge: 'code',
						code_challenge_method: 'S256',
					} as AuthorizationParamsExtended),
				);
				expect(response.status).toBe(200);
				const meta = getMeta(await response.text());
				expect(meta.clientName).toBe('Misklient');
				expect(meta.clientLogo).toBe(`http://127.0.0.1:${clientPort}/logo.png`);
			});

			test('Missing Logo', async () => {
				sender = (reply): void => {
					reply.header('Link', '</redirect>; rel="redirect_uri"');
					reply.send(`
						<!DOCTYPE html>
						<div class="h-app"><a href="/" class="u-url p-name">Misklient
					`);
					reply.send();
				};

				const client = new AuthorizationCode(clientConfig);

				const response = await fetch(
					client.authorizeURL({
						redirect_uri,
						scope: 'write:notes',
						state: 'state',
						code_challenge: 'code',
						code_challenge_method: 'S256',
					} as AuthorizationParamsExtended),
				);
				expect(response.status).toBe(200);
				const meta = getMeta(await response.text());
				expect(meta.clientName).toBe('Misklient');
				expect(meta.clientLogo).toBe(undefined);
			});

			test('Mismatching URL in h-app', async () => {
				sender = (reply): void => {
					reply.header('Link', '</redirect>; rel="redirect_uri"');
					reply.send(`
						<!DOCTYPE html>
						<div class="h-app"><a href="/foo" class="u-url p-name">Misklient
					`);
					reply.send();
				};

				const client = new AuthorizationCode(clientConfig);

				const response = await fetch(
					client.authorizeURL({
						redirect_uri,
						scope: 'write:notes',
						state: 'state',
						code_challenge: 'code',
						code_challenge_method: 'S256',
					} as AuthorizationParamsExtended),
				);
				expect(response.status).toBe(200);
				expect(getMeta(await response.text()).clientName).toBe(`http://127.0.0.1:${clientPort}/`);
			});
		});
	});

	test('Unknown OAuth endpoint', async () => {
		const response = await fetch(new URL('/oauth/foo', host));
		expect(response.status).toBe(404);
	});

	describe('CORS', () => {
		test('Token endpoint should support CORS', async () => {
			const response = await fetch(new URL('/oauth/token', host), { method: 'POST' });
			assert.ok(!response.ok);
			expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		});

		test('Authorize endpoint should not support CORS', async () => {
			const response = await fetch(new URL('/oauth/authorize', host), { method: 'GET' });
			assert.ok(!response.ok);
			assert.ok(!response.headers.has('Access-Control-Allow-Origin'));
		});

		test('Decision endpoint should not support CORS', async () => {
			const response = await fetch(new URL('/oauth/decision', host), { method: 'POST' });
			assert.ok(!response.ok);
			assert.ok(!response.headers.has('Access-Control-Allow-Origin'));
		});
	});
});
