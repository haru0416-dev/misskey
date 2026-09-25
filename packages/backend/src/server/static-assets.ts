/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib';
import { Hono } from 'hono';
import type { Context } from 'hono';
import mime from 'mime-types';
import sharp from 'sharp';
import type { Config } from '@/config.js';

type StaticMount = {
	prefix: string;
	root: string;
	cacheControl: string;
};

export type StaticAssetsDependencies = {
	config: Config;
};

function pathAfter(requestUrl: string, prefix: string): string {
	const pathname = new URL(requestUrl).pathname;
	return pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '';
}

function safeResolve(root: string, path: string): string | null {
	let decoded: string;
	try {
		decoded = decodeURIComponent(path);
	} catch {
		return null;
	}

	if (decoded.includes('\0')) {
		return null;
	}

	const fullPath = resolve(root, decoded);
	const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
	if (fullPath !== root && !fullPath.startsWith(rootPrefix)) {
		return null;
	}

	return fullPath;
}

/*
 * 文字の多い静的ファイルは、最初の要求で 1 度だけ圧縮して保持する。/vite/ の成果物はハッシュ付きで変わらず、
 * 1 言語分の JS・CSS 5.2 MB は brotli で 30%・gzip で 32% になる (起動時の読み込みは非圧縮で 868 KB)。
 * ビルド時に全言語分 (186 MB) を作ると 1 言語 0.4〜0.6 秒 × 30 かかるので、要求された分だけにする。
 */
const COMPRESSIBLE_EXTENSIONS = new Set([
	'.js',
	'.mjs',
	'.css',
	'.json',
	'.svg',
	'.html',
	'.txt',
	'.map',
	'.xml',
	'.webmanifest',
]);
const MIN_COMPRESS_SIZE = 1024;
const MAX_COMPRESSED_CACHE_BYTES = 64 * 1024 * 1024;
const brotliCompressAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);
type StaticEncoding = 'br' | 'gzip';
const compressedCache = new Map<string, Promise<Uint8Array>>();
const compressedSizes = new Map<string, number>();
let compressedCacheBytes = 0;

function acceptedStaticEncoding(header: string | undefined): StaticEncoding | null {
	if (header == null) return null;
	const accepted = new Set<string>();
	for (const part of header.split(',')) {
		const [name, ...params] = part.trim().toLowerCase().split(';');
		const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
		if (name && (q == null || Number(q.slice(2)) > 0)) accepted.add(name);
	}
	if (accepted.has('br')) return 'br';
	if (accepted.has('gzip')) return 'gzip';
	return null;
}

function compressedFile(
	filePath: string,
	mtimeMs: number,
	size: number,
	encoding: StaticEncoding,
): Promise<Uint8Array> {
	const key = `${encoding}\0${filePath}\0${mtimeMs}\0${size}`;
	const cached = compressedCache.get(key);
	if (cached != null) return cached;
	const pending = (async () => {
		const raw = await readFile(filePath);
		const compressed =
			encoding === 'br'
				? await brotliCompressAsync(raw, {
						params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 9, [zlibConstants.BROTLI_PARAM_SIZE_HINT]: raw.length },
					})
				: await gzipAsync(raw, { level: 9 });
		return new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength);
	})();
	compressedCache.set(key, pending);
	pending.then(
		(bytes) => {
			if (compressedCache.get(key) !== pending) return;
			compressedSizes.set(key, bytes.byteLength);
			compressedCacheBytes += bytes.byteLength;
			// 古いものから捨てる (Map は挿入順)。
			for (const [oldKey, oldSize] of compressedSizes) {
				if (compressedCacheBytes <= MAX_COMPRESSED_CACHE_BYTES) break;
				compressedSizes.delete(oldKey);
				compressedCache.delete(oldKey);
				compressedCacheBytes -= oldSize;
			}
		},
		() => compressedCache.delete(key),
	);
	return pending;
}

async function serveFile(
	c: Context,
	filePath: string,
	cacheControl: string,
	extraHeaders?: Record<string, string>,
): Promise<Response> {
	const fileStat = await stat(filePath).catch(() => null);
	if (fileStat == null || !fileStat.isFile()) {
		return c.body(null, 404);
	}

	const headers = new Headers({
		'Cache-Control': cacheControl,
		'Content-Length': String(fileStat.size),
		'Last-Modified': fileStat.mtime.toUTCString(),
		...extraHeaders,
	});
	const contentType = mime.lookup(filePath);
	if (contentType) {
		headers.set('Content-Type', contentType);
	}

	if (fileStat.size >= MIN_COMPRESS_SIZE && COMPRESSIBLE_EXTENSIONS.has(extname(filePath).toLowerCase())) {
		headers.set('Vary', 'Accept-Encoding');
		const encoding = acceptedStaticEncoding(c.req.header('Accept-Encoding'));
		if (encoding != null) {
			const body = await compressedFile(filePath, fileStat.mtimeMs, fileStat.size, encoding);
			headers.set('Content-Encoding', encoding);
			headers.set('Content-Length', String(body.byteLength));
			return new Response(c.req.method === 'HEAD' ? null : body, { status: 200, headers });
		}
	}

	if (c.req.method === 'HEAD') {
		return new Response(null, {
			status: 200,
			headers,
		});
	}

	return new Response(Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>, {
		status: 200,
		headers,
	});
}

function registerStaticMount(app: Hono, mount: StaticMount): void {
	const path = `${mount.prefix}*`;
	const handler = async (c: Context) => {
		const filePath = safeResolve(mount.root, pathAfter(c.req.url, mount.prefix));
		if (filePath == null) {
			return c.body(null, 404);
		}

		return await serveFile(c, filePath, mount.cacheControl);
	};

	app.get(path, handler);
	app.on('HEAD', path, handler);
}

/**
 * frontend の vite ビルド成果物が無い開発時は、vite dev サーバーへ HTTP プロキシする。
 * HMR の WebSocket は vite.config.ts の `hmr.clientPort: 5173` によりクライアントが
 * vite サーバーへ直接張るため、ここでは HTTP のみ転送すればよい。
 */
function registerViteDevProxy(app: Hono, opts: { prefix: string; upstream: string }): void {
	const path = `${opts.prefix}*`;
	const handler = async (c: Context) => {
		const reqUrl = new URL(c.req.url);
		const target = new URL(reqUrl.pathname + reqUrl.search, opts.upstream);
		const res = await fetch(target, {
			method: c.req.method,
			headers: {
				accept: c.req.header('accept') ?? '*/*',
			},
			redirect: 'manual',
		}).catch(() => null);
		if (res == null) {
			return c.body(null, 502);
		}

		const headers = new Headers(res.headers);
		// fetch がボディを展開済みのため、エンコーディング/長さ系ヘッダは付け直さない
		headers.delete('content-encoding');
		headers.delete('content-length');
		headers.delete('transfer-encoding');
		return new Response(res.body, { status: res.status, headers });
	};

	app.get(path, handler);
	app.on('HEAD', path, handler);
}

function emojiPath(c: Context, prefix: string): string {
	return pathAfter(c.req.url, prefix);
}

function emojiSecurityHeaders(): Record<string, string> {
	return {
		'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
	};
}

export function createStaticAssetsApp(deps: StaticAssetsDependencies): Hono {
	const app = new Hono();
	const backendRoot = resolve(deps.config.runtime.rootDir, 'packages/backend');
	const frontendRoot = resolve(deps.config.runtime.rootDir, 'packages/frontend');
	const staticAssets = resolve(backendRoot, 'assets');
	const fluentEmojiDir = resolve(backendRoot, 'node_modules/@misskey-dev/emoji-assets/built/fluent-emoji');
	const twemojiDir = resolve(backendRoot, 'node_modules/@misskey-dev/emoji-assets/built/twemoji');

	registerStaticMount(app, {
		prefix: '/static-assets/',
		root: staticAssets,
		cacheControl: 'public, max-age=604800',
	});
	registerStaticMount(app, {
		prefix: '/client-assets/',
		root: resolve(frontendRoot, 'assets'),
		cacheControl: 'public, max-age=604800',
	});
	registerStaticMount(app, {
		prefix: '/assets/',
		root: resolve(deps.config.runtime.rootDir, 'built/_frontend_dist_'),
		cacheControl: 'public, max-age=604800',
	});
	if (deps.config.runtime.frontendManifestExists) {
		registerStaticMount(app, {
			prefix: '/vite/',
			root: resolve(deps.config.runtime.rootDir, 'built/_frontend_vite_'),
			cacheControl: 'public, max-age=2592000, immutable',
		});
	} else {
		registerViteDevProxy(app, { prefix: '/vite/', upstream: 'http://localhost:5173' });
	}
	if (deps.config.runtime.frontendEmbedManifestExists) {
		registerStaticMount(app, {
			prefix: '/embed_vite/',
			root: resolve(deps.config.runtime.rootDir, 'built/_frontend_embed_vite_'),
			cacheControl: 'public, max-age=2592000, immutable',
		});
	} else {
		registerViteDevProxy(app, { prefix: '/embed_vite/', upstream: 'http://localhost:5174' });
	}
	registerStaticMount(app, {
		prefix: '/tarball/',
		root: resolve(deps.config.runtime.rootDir, 'built/tarball'),
		cacheControl: 'public, max-age=2592000, immutable',
	});

	app.get(
		'/favicon.ico',
		async (c) => await serveFile(c, resolve(staticAssets, 'favicon.ico'), 'public, max-age=604800'),
	);
	app.on(
		'HEAD',
		'/favicon.ico',
		async (c) => await serveFile(c, resolve(staticAssets, 'favicon.ico'), 'public, max-age=604800'),
	);
	app.get(
		'/apple-touch-icon.png',
		async (c) => await serveFile(c, resolve(staticAssets, 'apple-touch-icon.png'), 'public, max-age=604800'),
	);
	app.on(
		'HEAD',
		'/apple-touch-icon.png',
		async (c) => await serveFile(c, resolve(staticAssets, 'apple-touch-icon.png'), 'public, max-age=604800'),
	);
	app.get('/fluent-emoji/*', async (c) => {
		const path = emojiPath(c, '/fluent-emoji/');
		if (!/^[0-9a-f-]+\.png$/.test(path)) {
			return c.body(null, 404);
		}
		return await serveFile(c, resolve(fluentEmojiDir, path), 'public, max-age=2592000', emojiSecurityHeaders());
	});
	app.on('HEAD', '/fluent-emoji/*', async (c) => {
		const path = emojiPath(c, '/fluent-emoji/');
		if (!/^[0-9a-f-]+\.png$/.test(path)) {
			return c.body(null, 404);
		}
		return await serveFile(c, resolve(fluentEmojiDir, path), 'public, max-age=2592000', emojiSecurityHeaders());
	});
	app.get('/twemoji/*', async (c) => {
		const path = emojiPath(c, '/twemoji/');
		if (!/^[0-9a-f-]+\.svg$/.test(path)) {
			return c.body(null, 404);
		}
		return await serveFile(c, resolve(twemojiDir, path), 'public, max-age=2592000', emojiSecurityHeaders());
	});
	app.on('HEAD', '/twemoji/*', async (c) => {
		const path = emojiPath(c, '/twemoji/');
		if (!/^[0-9a-f-]+\.svg$/.test(path)) {
			return c.body(null, 404);
		}
		return await serveFile(c, resolve(twemojiDir, path), 'public, max-age=2592000', emojiSecurityHeaders());
	});
	app.get('/twemoji-badge/*', async (c) => {
		const path = emojiPath(c, '/twemoji-badge/');
		if (!/^[0-9a-f-]+\.png$/.test(path)) {
			return c.body(null, 404);
		}

		const mask = await sharp(resolve(twemojiDir, `${path.replace('.png', '')}.svg`), { density: 1000 })
			.resize(488, 488)
			.greyscale()
			.normalise()
			.linear(1.75, -(128 * 1.75) + 128)
			.flatten({ background: '#000' })
			.extend({
				top: 12,
				bottom: 12,
				left: 12,
				right: 12,
				background: '#000',
			})
			.toColorspace('b-w')
			.png()
			.toBuffer();

		const buffer = await sharp({
			create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
		})
			.pipelineColorspace('b-w')
			.boolean(mask, 'eor')
			.resize(96, 96)
			.png()
			.toBuffer();

		return new Response(buffer, {
			status: 200,
			headers: {
				...emojiSecurityHeaders(),
				'Cache-Control': 'max-age=2592000',
				'Content-Length': String(buffer.length),
				'Content-Type': 'image/png',
			},
		});
	});
	app.get(
		'/sw.js',
		async (c) =>
			await serveFile(c, resolve(deps.config.runtime.rootDir, 'built/_sw_dist_/sw.js'), 'public, max-age=600'),
	);
	app.on(
		'HEAD',
		'/sw.js',
		async (c) =>
			await serveFile(c, resolve(deps.config.runtime.rootDir, 'built/_sw_dist_/sw.js'), 'public, max-age=600'),
	);
	app.get('/embed.js', async (c) => await serveFile(c, resolve(staticAssets, 'embed.js'), 'public, max-age=86400'));
	app.on(
		'HEAD',
		'/embed.js',
		async (c) => await serveFile(c, resolve(staticAssets, 'embed.js'), 'public, max-age=86400'),
	);

	return app;
}
