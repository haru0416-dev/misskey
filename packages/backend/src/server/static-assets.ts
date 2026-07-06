/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { Hono, type Context } from 'hono';
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

	if (decoded.includes('\0')) return null;

	const fullPath = resolve(root, decoded);
	const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
	if (fullPath !== root && !fullPath.startsWith(rootPrefix)) return null;

	return fullPath;
}

async function serveFile(c: Context, filePath: string, cacheControl: string, extraHeaders?: Record<string, string>): Promise<Response> {
	const fileStat = await stat(filePath).catch(() => null);
	if (fileStat == null || !fileStat.isFile()) {
		return c.body(null, 404);
	}

	const headers = new Headers({
		'Cache-Control': cacheControl,
		'Content-Length': String(fileStat.size),
		'Last-Modified': fileStat.mtime.toUTCString(),
		...(extraHeaders ?? {}),
	});
	const contentType = mime.lookup(filePath);
	if (contentType) {
		headers.set('Content-Type', contentType);
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
		if (filePath == null) return c.body(null, 404);

		return await serveFile(c, filePath, mount.cacheControl);
	};

	app.get(path, handler);
	app.on('HEAD', path, handler);
}

function emojiPath(c: Context, prefix: string): string {
	return pathAfter(c.req.url, prefix);
}

function emojiSecurityHeaders(): Record<string, string> {
	return {
		'Content-Security-Policy': 'default-src \'none\'; style-src \'unsafe-inline\'',
	};
}

export function createStaticAssetsApp(deps: StaticAssetsDependencies): Hono {
	const app = new Hono();
	const backendRoot = resolve(deps.config.rootDir, 'packages/backend');
	const frontendRoot = resolve(deps.config.rootDir, 'packages/frontend');
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
		root: resolve(deps.config.rootDir, 'built/_frontend_dist_'),
		cacheControl: 'public, max-age=604800',
	});
	registerStaticMount(app, {
		prefix: '/vite/',
		root: resolve(deps.config.rootDir, 'built/_frontend_vite_'),
		cacheControl: 'public, max-age=2592000, immutable',
	});
	registerStaticMount(app, {
		prefix: '/embed_vite/',
		root: resolve(deps.config.rootDir, 'built/_frontend_embed_vite_'),
		cacheControl: 'public, max-age=2592000, immutable',
	});
	registerStaticMount(app, {
		prefix: '/tarball/',
		root: resolve(deps.config.rootDir, 'built/tarball'),
		cacheControl: 'public, max-age=2592000, immutable',
	});

	app.get('/favicon.ico', async (c) => await serveFile(c, resolve(staticAssets, 'favicon.ico'), 'public, max-age=604800'));
	app.on('HEAD', '/favicon.ico', async (c) => await serveFile(c, resolve(staticAssets, 'favicon.ico'), 'public, max-age=604800'));
	app.get('/apple-touch-icon.png', async (c) => await serveFile(c, resolve(staticAssets, 'apple-touch-icon.png'), 'public, max-age=604800'));
	app.on('HEAD', '/apple-touch-icon.png', async (c) => await serveFile(c, resolve(staticAssets, 'apple-touch-icon.png'), 'public, max-age=604800'));
	app.get('/fluent-emoji/*', async (c) => {
		const path = emojiPath(c, '/fluent-emoji/');
		if (!path.match(/^[0-9a-f-]+\.png$/)) return c.body(null, 404);
		return await serveFile(c, resolve(fluentEmojiDir, path), 'public, max-age=2592000', emojiSecurityHeaders());
	});
	app.on('HEAD', '/fluent-emoji/*', async (c) => {
		const path = emojiPath(c, '/fluent-emoji/');
		if (!path.match(/^[0-9a-f-]+\.png$/)) return c.body(null, 404);
		return await serveFile(c, resolve(fluentEmojiDir, path), 'public, max-age=2592000', emojiSecurityHeaders());
	});
	app.get('/twemoji/*', async (c) => {
		const path = emojiPath(c, '/twemoji/');
		if (!path.match(/^[0-9a-f-]+\.svg$/)) return c.body(null, 404);
		return await serveFile(c, resolve(twemojiDir, path), 'public, max-age=2592000', emojiSecurityHeaders());
	});
	app.on('HEAD', '/twemoji/*', async (c) => {
		const path = emojiPath(c, '/twemoji/');
		if (!path.match(/^[0-9a-f-]+\.svg$/)) return c.body(null, 404);
		return await serveFile(c, resolve(twemojiDir, path), 'public, max-age=2592000', emojiSecurityHeaders());
	});
	app.get('/twemoji-badge/*', async (c) => {
		const path = emojiPath(c, '/twemoji-badge/');
		if (!path.match(/^[0-9a-f-]+\.png$/)) return c.body(null, 404);

		const mask = await sharp(
			resolve(twemojiDir, `${path.replace('.png', '')}.svg`),
			{ density: 1000 },
		)
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
	app.get('/sw.js', async (c) => await serveFile(c, resolve(deps.config.rootDir, 'built/_sw_dist_/sw.js'), 'public, max-age=600'));
	app.on('HEAD', '/sw.js', async (c) => await serveFile(c, resolve(deps.config.rootDir, 'built/_sw_dist_/sw.js'), 'public, max-age=600'));
	app.get('/embed.js', async (c) => await serveFile(c, resolve(staticAssets, 'embed.js'), 'public, max-age=86400'));
	app.on('HEAD', '/embed.js', async (c) => await serveFile(c, resolve(staticAssets, 'embed.js'), 'public, max-age=86400'));

	return app;
}
