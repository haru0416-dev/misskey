/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { gunzipSync } from 'node:zlib';
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { describe, expect, test } from 'vitest';
import { jsonResponse } from '@/server/rest/shell-helpers.js';

// app.ts と同じく hono/compress の内側で jsonResponse を返し、同期で圧縮する範囲とストリームに任せる範囲、
// および hono/compress と同じ Accept-Encoding の扱いを見る。
describe('jsonResponse の圧縮', () => {
	const body = Array.from({ length: 400 }, (_, i) => ({ id: `note${i}`, text: 'あいうえお hello '.repeat(3) }));
	const huge = { text: 'x'.repeat(1024 * 1024 + 1) };

	function createApp(): Hono {
		const app = new Hono();
		app.use('*', compress());
		app.get('/json', (c) => jsonResponse(c, body));
		app.get('/small', (c) => jsonResponse(c, { ok: true }));
		app.get('/huge', (c) => jsonResponse(c, huge));
		app.get('/cached', (c) => jsonResponse(c, body, 200, { 'Cache-Control': 'public, max-age=60' }));
		return app;
	}

	test('gzip を受け付けるなら同期で圧縮し、圧縮後の長さと Vary を付ける', async () => {
		const res = await createApp().request('/json', { headers: { 'Accept-Encoding': 'gzip, deflate, br' } });
		const bytes = new Uint8Array(await res.arrayBuffer());
		expect(res.headers.get('Content-Encoding')).toBe('gzip');
		expect(res.headers.get('Content-Length')).toBe(String(bytes.byteLength));
		expect(res.headers.get('Vary')).toBe('Accept-Encoding');
		expect(JSON.parse(gunzipSync(bytes).toString())).toEqual(body);
	});

	test('公開キャッシュする応答にも Vary を付ける', async () => {
		const res = await createApp().request('/cached', { headers: { 'Accept-Encoding': 'gzip' } });
		expect(res.headers.get('Content-Encoding')).toBe('gzip');
		expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
		expect(res.headers.get('Vary')).toBe('Accept-Encoding');
	});

	test('gzip を受け付けないクライアントは hono/compress の判断のまま (無しなら素通し、deflate だけなら deflate)', async () => {
		const app = createApp();
		for (const accept of [undefined, 'identity', 'gzip;q=0']) {
			const res = await app.request('/json', accept == null ? {} : { headers: { 'Accept-Encoding': accept } });
			expect(res.headers.get('Content-Encoding'), accept).toBeNull();
			expect(res.headers.get('Vary'), accept).toBe('Accept-Encoding');
			expect(await res.json(), accept).toEqual(body);
		}
		const deflate = await app.request('/json', { headers: { 'Accept-Encoding': 'gzip;q=0.5, deflate' } });
		expect(deflate.headers.get('Content-Encoding')).toBe('deflate');
	});

	test('小さい応答と HEAD は圧縮しない', async () => {
		const app = createApp();
		const small = await app.request('/small', { headers: { 'Accept-Encoding': 'gzip' } });
		expect(small.headers.get('Content-Encoding')).toBeNull();
		const head = await app.request('/json', { method: 'HEAD', headers: { 'Accept-Encoding': 'gzip' } });
		expect(head.headers.get('Content-Encoding')).toBeNull();
	});

	test('1MiB を超える応答はストリームで圧縮する (長さを付けない)', async () => {
		const res = await createApp().request('/huge', { headers: { 'Accept-Encoding': 'gzip' } });
		expect(res.headers.get('Content-Encoding')).toBe('gzip');
		expect(res.headers.get('Content-Length')).toBeNull();
		expect(JSON.parse(gunzipSync(new Uint8Array(await res.arrayBuffer())).toString())).toEqual(huge);
	});
});
