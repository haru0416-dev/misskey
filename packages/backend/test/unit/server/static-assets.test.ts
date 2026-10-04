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
writeFileSync(join(viteDir, 'concurrent.js'), script);
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
		expect(brotliDecompressSync(body).equals(script)).toBe(true);
	});

	test('brotli が q=0 なら、同じファイルへの初回の同時要求を gzip で返す', async () => {
		const responses = await Promise.all([
			get('/vite/ja-JP/concurrent.js', 'br;q=0, gzip'),
			get('/vite/ja-JP/concurrent.js', 'br;q=0, gzip'),
		]);
		const bodies = await Promise.all(responses.map(async (res) => Buffer.from(await res.arrayBuffer())));
		for (const [index, res] of responses.entries()) {
			expect(res.headers.get('Content-Encoding')).toBe('gzip');
			expect(res.headers.get('Vary')).toBe('Accept-Encoding');
			expect(res.headers.get('Content-Type')).toContain('javascript');
			expect(Number(res.headers.get('Content-Length'))).toBe(bodies[index]!.length);
			expect(gunzipSync(bodies[index]!).equals(script)).toBe(true);
		}
		for (const header of ['Content-Encoding', 'Vary', 'Content-Type', 'Content-Length']) {
			expect(responses[1]!.headers.get(header)).toBe(responses[0]!.headers.get(header));
		}
		expect(bodies[1]).toEqual(bodies[0]);
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
});
