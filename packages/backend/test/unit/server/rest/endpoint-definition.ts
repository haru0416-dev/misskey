/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Hono } from 'hono';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { defineContract } from '@/server/rest/endpoint-contract.js';
import { implementEndpoints, registerEndpoints } from '@/server/rest/endpoint-definition.js';
import { ApiError } from '@/server/rest/error.js';

const contracts = {
	'probe/show': defineContract({
		meta: {
			allowQuery: true,
			requireCredential: false,
			res: { type: 'object', optional: false, nullable: false, properties: { id: { type: 'string' } } },
			errors: {
				gone: { message: 'Gone.', code: 'GONE', id: '0c6f4d9e-4b53-4d62-9a1d-2f0a5b8f7c11', httpStatusCode: 404 },
			},
		},
		paramDef: z.object({ id: z.string(), mode: z.enum(['ok', 'gone', 'undeclared']).optional() }),
	}),
	'probe/featured': defineContract({
		meta: {
			allowGet: true,
			cacheSec: 60,
			requireCredential: false,
			res: { type: 'object', optional: false, nullable: false, properties: { limit: { type: 'number' } } },
		},
		paramDef: z.object({ limit: z.number().int().optional() }),
	}),
	'probe/delete': defineContract({
		meta: { requireCredential: true, kind: 'write:notes' },
		paramDef: z.object({}),
	}),
	'probe/touch': defineContract({
		meta: { requireCredential: false },
		paramDef: z.object({}),
	}),
};

const endpoints = implementEndpoints<object>()(contracts, {
	'probe/show': async ({ input, errors }) => {
		if (input.mode === 'gone') throw errors.gone();
		if (input.mode === 'undeclared') {
			throw new ApiError({
				status: 400,
				message: 'x',
				code: 'NOT_DECLARED',
				id: 'e7d5a7c2-8b1f-4a55-9d61-3c2f0e4b9a77',
			});
		}
		return { id: input.id };
	},
	'probe/featured': async ({ input }) => ({ limit: input.limit ?? 0 }),
	'probe/delete': async () => {},
	'probe/touch': async () => {},
});

function createApp() {
	const app = new Hono();
	registerEndpoints(app, {} as never, endpoints);
	return app;
}

type ErrorBody = { error: { code: string; id: string } };
const errorOf = async (res: Response) => ((await res.json()) as ErrorBody).error;

const post = (app: Hono, path: string, body: unknown, method = 'POST') =>
	app.request(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('registerEndpoints', () => {
	test('meta の allowQuery / allowGet どおりにメソッドを登録する', () => {
		const routes = createApp().routes.map((route) => `${route.method} ${route.path}`);
		expect(routes.toSorted()).toStrictEqual(
			[
				'POST /probe/show',
				'QUERY /probe/show',
				'POST /probe/featured',
				'GET /probe/featured',
				'POST /probe/delete',
				'POST /probe/touch',
			].toSorted(),
		);
	});

	test('入力を検証してから実装に渡し、応答を JSON で返す', async () => {
		const app = createApp();
		const ok = await post(app, '/probe/show', { id: 'a' });
		expect(ok.status).toBe(200);
		expect(await ok.json()).toStrictEqual({ id: 'a' });

		const query = await post(app, '/probe/show', { id: 'b' }, 'QUERY');
		expect(await query.json()).toStrictEqual({ id: 'b' });

		const invalid = await post(app, '/probe/show', {});
		expect(invalid.status).toBe(400);
		expect((await errorOf(invalid)).code).toBe('INVALID_PARAM');
	});

	test('宣言したエラーは宣言の HTTP ステータス・code・id で返す', async () => {
		const res = await post(createApp(), '/probe/show', { id: 'a', mode: 'gone' });
		expect(res.status).toBe(404);
		expect(await errorOf(res)).toMatchObject({ code: 'GONE', id: '0c6f4d9e-4b53-4d62-9a1d-2f0a5b8f7c11' });
	});

	test('宣言に無いエラーはテスト環境で 500 にして止める', async () => {
		const res = await post(createApp(), '/probe/show', { id: 'a', mode: 'undeclared' });
		expect(res.status).toBe(500);
		expect((await errorOf(res)).code).toBe('INTERNAL_ERROR');
	});

	test('GET はクエリを入力に変換し、匿名には cacheSec の公開キャッシュを付ける', async () => {
		const res = await createApp().request('/probe/featured?limit=3');
		expect(res.status).toBe(200);
		expect(await res.json()).toStrictEqual({ limit: 3 });
		expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
	});

	test('res を宣言しないエンドポイントは 204 を返す', async () => {
		const res = await post(createApp(), '/probe/touch', {});
		expect(res.status).toBe(204);
	});

	test('実装の戻り値・実装の漏れ・宣言に無いエラーは型エラーになる', () => {
		// 型の検査は @ts-expect-error が使われなければ typecheck で落ちる。実行時は登録される名前だけ確かめる。
		const show = { 'probe/show': contracts['probe/show'] };
		const wrongResult = implementEndpoints<object>()(show, {
			// @ts-expect-error meta.res の id は string
			'probe/show': async () => ({ id: 1 }),
		});
		// @ts-expect-error 契約に対する実装が無い
		const missing = implementEndpoints<object>()(show, {});
		const undeclared = implementEndpoints<object>()(show, {
			'probe/show': async ({ errors }) => {
				// @ts-expect-error meta.errors に無いキー
				throw errors.notDeclared();
			},
		});
		expect([wrongResult, missing, undeclared].map((list) => list.map((endpoint) => endpoint.name))).toStrictEqual([
			['probe/show'],
			['probe/show'],
			['probe/show'],
		]);
	});

	test('requireCredential の meta は資格情報なしを 401 で拒否し、実装を呼ばない', async () => {
		const res = await post(createApp(), '/probe/delete', {});
		expect(res.status).toBe(401);
		expect((await errorOf(res)).code).toBe('CREDENTIAL_REQUIRED');
	});
});
