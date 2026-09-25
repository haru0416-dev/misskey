/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { afterAll, describe, expect, test } from 'vitest';
import type { Config } from '@/config.js';
import { createStaticAssetsApp } from '@/server/static-assets.js';

const root = mkdtempSync(join(tmpdir(), 'misskey-static-'));
const viteDir = join(root, 'built/_frontend_vite_/ja-JP');
mkdirSync(viteDir, { recursive: true });
const script = Buffer.from('export const value = "' + 'misskey '.repeat(2000) + '";\n');
writeFileSync(join(viteDir, 'app.js'), script);
writeFileSync(join(viteDir, 'tiny.js'), 'export {};\n');
writeFileSync(join(viteDir, 'image.png'), Buffer.alloc(4096, 1));

const app = createStaticAssetsApp({
	config: {
		runtime: { rootDir: root, frontendManifestExists: true, frontendEmbedManifestExists: true },
	} as unknown as Config,
});

function get(path: string, acceptEncoding?: string, method = 'GET') {
	return app.request(path, { method, headers: acceptEncoding == null ? {} : { 'Accept-Encoding': acceptEncoding } });
}

afterAll(() => {
	rmSync(root, { recursive: true, force: true });
});

describe('static assets compression', () => {
	test('brotli を受け付けるなら brotli で返し、展開すると元のファイルになる', async () => {
		const res = await get('/vite/ja-JP/app.js', 'gzip, deflate, br');
		expect(res.headers.get('Content-Encoding')).toBe('br');
		expect(res.headers.get('Vary')).toBe('Accept-Encoding');
		expect(res.headers.get('Content-Type')).toContain('javascript');
		const body = Buffer.from(await res.arrayBuffer());
		expect(Number(res.headers.get('Content-Length'))).toBe(body.length);
		expect(body.length).toBeLessThan(script.length / 10);
		expect(brotliDecompressSync(body).equals(script)).toBe(true);
	});

	test('brotli が q=0 なら gzip で返す', async () => {
		const res = await get('/vite/ja-JP/app.js', 'br;q=0, gzip');
		expect(res.headers.get('Content-Encoding')).toBe('gzip');
		expect(gunzipSync(Buffer.from(await res.arrayBuffer())).equals(script)).toBe(true);
	});

	test('圧縮を受け付けない要求にはそのまま返す', async () => {
		const res = await get('/vite/ja-JP/app.js');
		expect(res.headers.get('Content-Encoding')).toBeNull();
		expect(res.headers.get('Vary')).toBe('Accept-Encoding');
		expect(Buffer.from(await res.arrayBuffer()).equals(script)).toBe(true);
	});

	test('小さいファイルと画像は圧縮しない', async () => {
		for (const path of ['/vite/ja-JP/tiny.js', '/vite/ja-JP/image.png']) {
			const res = await get(path, 'br, gzip');
			expect(res.headers.get('Content-Encoding')).toBeNull();
			await res.arrayBuffer();
		}
	});

	test('HEAD は圧縮後の長さを返し本文を持たない', async () => {
		const res = await get('/vite/ja-JP/app.js', 'br', 'HEAD');
		expect(res.headers.get('Content-Encoding')).toBe('br');
		expect(Number(res.headers.get('Content-Length'))).toBeGreaterThan(0);
		expect((await res.arrayBuffer()).byteLength).toBe(0);
	});

	test('同時の要求も同じ圧縮結果を返す', async () => {
		const bodies = await Promise.all(
			Array.from({ length: 5 }, async () => Buffer.from(await (await get('/vite/ja-JP/app.js', 'gzip')).arrayBuffer())),
		);
		for (const body of bodies) expect(gunzipSync(body).equals(script)).toBe(true);
	});
});
