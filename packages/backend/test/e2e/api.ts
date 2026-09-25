/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'node:assert';
import { beforeAll, describe, expect, test } from 'vitest';
import * as http from 'node:http';
import * as https from 'node:https';
import type { IncomingMessage } from 'node:http';
import { gunzipSync } from 'node:zlib';
import {
	api,
	createAppToken,
	failedApiCall,
	relativeFetch,
	resolveTargetUrl,
	signup,
	successfulApiCall,
	uploadFile,
	waitFire,
} from '../utils.js';
import type * as misskey from 'misskey-js';

/** 自動で展開しない生の HTTP 要求。圧縮された応答本文をそのまま返す。 */
function requestRaw(
	path: string,
	init: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
	return new Promise((resolve, reject) => {
		const url = resolveTargetUrl(path);
		const client = url.protocol === 'https:' ? https : http;
		const req = client.request(url, { method: init.method ?? 'GET', headers: init.headers }, (res) => {
			const chunks: Buffer[] = [];
			res.on('data', (chunk: Buffer) => chunks.push(chunk));
			res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
			res.on('error', reject);
		});
		req.on('error', reject);
		req.end(init.body);
	});
}

/** /streaming へのWebSocketアップグレード要求を送り、拒否時のHTTPレスポンスを返す */
function requestStreamingUpgrade(headers: Record<string, string>): Promise<IncomingMessage> {
	return new Promise((resolve, reject) => {
		const url = resolveTargetUrl('streaming');
		const client = url.protocol === 'https:' ? https : http;
		const req = client.get(
			url,
			{
				headers: {
					...headers,
					Connection: 'Upgrade',
					Upgrade: 'websocket',
					'Sec-WebSocket-Version': '13',
					'Sec-WebSocket-Key': Buffer.from('0123456789abcdef').toString('base64'),
				},
			},
			(res) => {
				res.resume();
				resolve(res);
			},
		);
		req.on('upgrade', (res, socket) => {
			socket.destroy();
			reject(new Error(`unexpected upgrade success (status ${res.statusCode})`));
		});
		req.on('error', reject);
	});
}

describe('API', () => {
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;

	beforeAll(
		async () => {
			alice = await signup({ username: 'alice' });
			bob = await signup({ username: 'bob' });
		},
		1000 * 60 * 2,
	);

	describe('General validation', () => {
		test('wrong type', async () => {
			const res = await api('test', {
				required: true,
				// @ts-expect-error string must be string
				string: 42,
			});
			expect(res.status).toBe(400);
		});

		test('missing require param', async () => {
			// @ts-expect-error required is required
			const res = await api('test', {
				string: 'a',
			});
			expect(res.status).toBe(400);
		});

		test('invalid misskey:id (empty string)', async () => {
			const res = await api('test', {
				required: true,
				id: '',
			});
			expect(res.status).toBe(400);
		});

		test('valid misskey:id', async () => {
			const res = await api('test', {
				required: true,
				id: '8wvhjghbxu',
			});
			expect(res.status).toBe(200);
		});

		test('default value', async () => {
			const res = await api('test', {
				required: true,
				string: 'a',
			});
			expect(res.status).toBe(200);
			expect(res.body.default).toBe('hello');
		});

		test('can set null even if it has default value', async () => {
			const res = await api('test', {
				required: true,
				nullableDefault: null,
			});
			expect(res.status).toBe(200);
			expect(res.body.nullableDefault).toBeNull();
		});

		test('cannot set undefined if it has default value', async () => {
			const params = { required: true };
			Object.defineProperty(params, 'nullableDefault', { value: undefined, enumerable: true });
			const res = await api('test', params);
			expect(res.status).toBe(200);
			expect(res.body.nullableDefault).toBe('hello');
		});
	});

	test('管理者専用のAPIのアクセス制限', async () => {
		const application = await createAppToken(alice, ['read:account']);
		const application2 = await createAppToken(alice, ['read:admin:index-stats']);
		const application3 = await createAppToken(bob, []);
		const application4 = await createAppToken(bob, ['read:admin:index-stats']);

		// aliceは管理者、APIを使える
		await successfulApiCall({
			endpoint: 'admin/get-index-stats',
			parameters: {},
			user: alice,
		});

		// bobは一般ユーザーだからダメ
		await failedApiCall(
			{
				endpoint: 'admin/get-index-stats',
				parameters: {},
				user: bob,
			},
			{
				status: 403,
				code: 'ROLE_PERMISSION_DENIED',
				id: 'c3d38592-54c0-429d-be96-5636b0431a61',
			},
		);

		// publicアクセスももちろんダメ
		await failedApiCall(
			{
				endpoint: 'admin/get-index-stats',
				parameters: {},
				user: undefined,
			},
			{
				status: 401,
				code: 'CREDENTIAL_REQUIRED',
				id: '1384574d-a912-4b81-8601-c7b1c4085df1',
			},
		);

		// ごまがしもダメ
		await failedApiCall(
			{
				endpoint: 'admin/get-index-stats',
				parameters: {},
				user: { token: 'tsukawasete' },
			},
			{
				status: 401,
				code: 'AUTHENTICATION_FAILED',
				id: 'b0a7f5f8-dc2f-4171-b91f-de88ad238e14',
			},
		);

		await successfulApiCall({
			endpoint: 'admin/get-index-stats',
			parameters: {},
			user: { token: application2 },
		});

		await failedApiCall(
			{
				endpoint: 'admin/get-index-stats',
				parameters: {},
				user: { token: application },
			},
			{
				status: 403,
				code: 'PERMISSION_DENIED',
				id: '1370e5b7-d4eb-4566-bb1d-7748ee6a1838',
			},
		);

		await failedApiCall(
			{
				endpoint: 'admin/get-index-stats',
				parameters: {},
				user: { token: application3 },
			},
			{
				status: 403,
				code: 'ROLE_PERMISSION_DENIED',
				id: 'c3d38592-54c0-429d-be96-5636b0431a61',
			},
		);

		await failedApiCall(
			{
				endpoint: 'admin/get-index-stats',
				parameters: {},
				user: { token: application4 },
			},
			{
				status: 403,
				code: 'ROLE_PERMISSION_DENIED',
				id: 'c3d38592-54c0-429d-be96-5636b0431a61',
			},
		);
	});

	describe('Authentication header', () => {
		test('一般リクエスト', async () => {
			await successfulApiCall({
				endpoint: 'admin/get-index-stats',
				parameters: {},
				user: {
					token: alice.token,
					bearer: true,
				},
			});
		});

		test('multipartリクエスト', async () => {
			const result = await uploadFile({
				token: alice.token,
				bearer: true,
			});
			expect(result.status).toBe(200);
		});

		test('streaming', async () => {
			const fired = await waitFire(
				{
					token: alice.token,
					bearer: true,
				},
				'homeTimeline',
				() => api('notes/create', { text: 'foo' }, alice),
				(msg) => msg.type === 'note' && msg.body['text'] === 'foo',
			);
			expect(fired).toBe(true);
		});
	});

	describe('tokenエラー応答でWWW-Authenticate headerを送る', () => {
		describe('invalid_token', () => {
			test('一般リクエスト', async () => {
				const result = await api(
					'admin/get-index-stats',
					{},
					{
						token: 'syuilo',
						bearer: true,
					},
				);
				expect(result.status).toBe(401);
				assert.ok(
					result.headers
						.get('WWW-Authenticate')
						?.startsWith('Bearer realm="Misskey", error="invalid_token", error_description'),
				);
			});

			test('multipartリクエスト', async () => {
				const result = await uploadFile({
					token: 'syuilo',
					bearer: true,
				});
				expect(result.status).toBe(401);
				assert.ok(
					result.headers
						.get('WWW-Authenticate')
						?.startsWith('Bearer realm="Misskey", error="invalid_token", error_description'),
				);
			});

			test('streaming', async () => {
				// Bunランタイムのws互換実装は 'unexpected-response' イベントを発火しないため、
				// connectStreamの失敗経由では401応答を観測できない (Promiseが永久に未解決になる)。
				// アップグレード要求への拒否応答はnode:httpで直接検証する
				const res = await requestStreamingUpgrade({ Authorization: 'Bearer syuilo' });
				expect(res.statusCode).toBe(401);
				assert.ok(
					res.headers['www-authenticate']?.startsWith(
						'Bearer realm="Misskey", error="invalid_token", error_description',
					),
				);
			});
		});

		describe('tokenがないとrealmだけおくる', () => {
			test('一般リクエスト', async () => {
				const result = await api('admin/get-index-stats', {});
				expect(result.status).toBe(401);
				expect(result.headers.get('WWW-Authenticate')).toBe('Bearer realm="Misskey"');
			});

			test('multipartリクエスト', async () => {
				const result = await uploadFile();
				expect(result.status).toBe(401);
				expect(result.headers.get('WWW-Authenticate')).toBe('Bearer realm="Misskey"');
			});
		});

		test('invalid_request', async () => {
			const result = await api(
				'notes/create',
				// @ts-expect-error text must be string
				{ text: true },
				{
					token: alice.token,
					bearer: true,
				},
			);
			expect(result.status).toBe(400);
			assert.ok(
				result.headers
					.get('WWW-Authenticate')
					?.startsWith('Bearer realm="Misskey", error="invalid_request", error_description'),
			);
		});

		describe('invalid bearer format', () => {
			test('No preceding bearer', async () => {
				const result = await relativeFetch('api/notes/create', {
					method: 'POST',
					headers: {
						Authorization: alice.token,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ text: 'test' }),
				});
				expect(result.status).toBe(401);
			});

			test('Lowercase bearer', async () => {
				const result = await relativeFetch('api/notes/create', {
					method: 'POST',
					headers: {
						Authorization: `bearer ${alice.token}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ text: 'test' }),
				});
				expect(result.status).toBe(401);
			});

			test('No space after bearer', async () => {
				const result = await relativeFetch('api/notes/create', {
					method: 'POST',
					headers: {
						Authorization: `Bearer${alice.token}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ text: 'test' }),
				});
				expect(result.status).toBe(401);
			});
		});
	});
});

describe('応答の圧縮', () => {
	let alice: misskey.entities.SignupResponse;

	beforeAll(async () => {
		alice = await signup({ username: 'compressalice' });
		for (let i = 0; i < 5; i++) await api('notes/create', { text: `圧縮の確認 ${i} ${'本文'.repeat(100)}` }, alice);
	}, 1000 * 60);

	test('API の JSON は gzip を受け付ける要求に gzip で返し、展開すると同じ内容になる', async () => {
		const body = JSON.stringify({ i: alice.token, limit: 5 });
		const headers = { 'Content-Type': 'application/json' };
		const plain = await requestRaw('api/notes/timeline', { method: 'POST', headers, body });
		const gzipped = await requestRaw('api/notes/timeline', {
			method: 'POST',
			headers: { ...headers, 'Accept-Encoding': 'gzip' },
			body,
		});

		expect(plain.headers['content-encoding']).toBeUndefined();
		expect(gzipped.status).toBe(200);
		expect(gzipped.headers['content-encoding']).toBe('gzip');
		expect(gzipped.headers['vary']).toContain('Accept-Encoding');
		expect(gzipped.body.length).toBeLessThan(plain.body.length);
		const notes = JSON.parse(gunzipSync(gzipped.body).toString('utf8')) as misskey.entities.Note[];
		expect(notes.map((note) => note.id)).toEqual(
			(JSON.parse(plain.body.toString('utf8')) as misskey.entities.Note[]).map((note) => note.id),
		);
	});

	test('小さい応答は圧縮しない', async () => {
		const small = await requestRaw('api/ping', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip' },
			body: '{}',
		});
		expect(small.status).toBe(200);
		expect(small.headers['content-encoding']).toBeUndefined();
	});
});
