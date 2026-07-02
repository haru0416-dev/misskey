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

async function serveFile(c: Context, filePath: string, cacheControl: string): Promise<Response> {
	const fileStat = await stat(filePath).catch(() => null);
	if (fileStat == null || !fileStat.isFile()) {
		return c.body(null, 404);
	}

	const headers = new Headers({
		'Cache-Control': cacheControl,
		'Content-Length': String(fileStat.size),
		'Last-Modified': fileStat.mtime.toUTCString(),
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

export function createStaticAssetsApp(deps: StaticAssetsDependencies): Hono {
	const app = new Hono();
	const backendRoot = resolve(deps.config.rootDir, 'packages/backend');
	const frontendRoot = resolve(deps.config.rootDir, 'packages/frontend');
	const staticAssets = resolve(backendRoot, 'assets');

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
		prefix: '/tarball/',
		root: resolve(deps.config.rootDir, 'built/tarball'),
		cacheControl: 'public, max-age=2592000, immutable',
	});

	app.get('/favicon.ico', async (c) => await serveFile(c, resolve(staticAssets, 'favicon.ico'), 'public, max-age=604800'));
	app.on('HEAD', '/favicon.ico', async (c) => await serveFile(c, resolve(staticAssets, 'favicon.ico'), 'public, max-age=604800'));
	app.get('/apple-touch-icon.png', async (c) => await serveFile(c, resolve(staticAssets, 'apple-touch-icon.png'), 'public, max-age=604800'));
	app.on('HEAD', '/apple-touch-icon.png', async (c) => await serveFile(c, resolve(staticAssets, 'apple-touch-icon.png'), 'public, max-age=604800'));

	return app;
}
