/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { createOAuthApp } from '@/server/hono-oauth.js';
import type { OAuthProviderRuntime } from '@/server/oauth/OAuthProviderRuntime.js';

function createRuntime(overrides: Partial<OAuthProviderRuntime> = {}): OAuthProviderRuntime {
	return {
		authorize: async () => new Response(null, { status: 501 }),
		decision: async () => new Response(null, { status: 501 }),
		token: async () => new Response(null, { status: 501 }),
		unknownEndpoint: () => new Response('unknown', { status: 404 }),
		tokenOptions: () => new Response(null, { status: 204 }),
		dispose: () => {},
		...overrides,
	};
}

describe('createOAuthApp', () => {
	test('passes query parameters to authorization runtime', async () => {
		const seen: unknown[] = [];
		const app = createOAuthApp({
			runtime: createRuntime({
				authorize: async (params) => {
					seen.push(params);
					return Response.json({ ok: true });
				},
			}),
		});

		const res = await app.request('http://example.test/authorize?scope=read:account&scope=write:notes&state=s');

		expect(res.status).toBe(200);
		expect(seen).toEqual([{ scope: ['read:account', 'write:notes'], state: 's' }]);
	});

	test('passes form parameters to decision runtime', async () => {
		const seen: unknown[] = [];
		const app = createOAuthApp({
			runtime: createRuntime({
				decision: async (params) => {
					seen.push(params);
					return new Response(null, { status: 302, headers: { Location: 'http://client.test/cb' } });
				},
			}),
		});

		const res = await app.request('http://example.test/decision', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ transaction_id: 'tx', login_token: 'token' }),
		});

		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toBe('http://client.test/cb');
		expect(seen).toEqual([{ transaction_id: 'tx', login_token: 'token' }]);
	});

	test('returns token CORS preflight from runtime', async () => {
		const app = createOAuthApp({
			runtime: createRuntime({
				tokenOptions: () => new Response(null, {
					status: 204,
					headers: { 'Access-Control-Allow-Origin': '*' },
				}),
			}),
		});

		const res = await app.request('http://example.test/token', { method: 'OPTIONS' });

		expect(res.status).toBe(204);
		expect(res.headers.get('access-control-allow-origin')).toBe('*');
	});

	test('passes form parameters to token runtime', async () => {
		const seen: unknown[] = [];
		const app = createOAuthApp({
			runtime: createRuntime({
				token: async (params) => {
					seen.push(params);
					return Response.json({ ok: true });
				},
			}),
		});

		const res = await app.request('http://example.test/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code: 'code',
				client_id: 'http://client.example/',
			}),
		});

		expect(res.status).toBe(200);
		expect(seen).toEqual([{
			grant_type: 'authorization_code',
			code: 'code',
			client_id: 'http://client.example/',
		}]);
	});
});
