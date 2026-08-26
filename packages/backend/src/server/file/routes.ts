/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { Hono, type Context } from 'hono';
import mime from 'mime-types';
import type { Config } from '@/config.js';
import type Logger from '@/logger.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { StatusError } from '@/misc/status-error.js';
import type { DownloadService } from '@/core/net/DownloadService.js';
import type { FileInfoService } from '@/core/drive/FileInfoService.js';
import type { ImageProcessingService } from '@/core/drive/ImageProcessingService.js';
import type { InternalStorageService } from '@/core/drive/InternalStorageService.js';
import type { VideoProcessingService } from '@/core/drive/VideoProcessingService.js';
import { FileServerDriveHandler } from './FileServerDriveHandler.js';
import { FileServerFileResolver } from './FileServerFileResolver.js';
import { FileServerProxyHandler } from './FileServerProxyHandler.js';
import type { FileServerHeaders, FileServerReply, FileServerRequest } from './FileServerTypes.js';

type FileBody = {
	type: 'file';
	path: string;
};

export type FileServerDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	fileInfoService: FileInfoService;
	downloadService: DownloadService;
	imageProcessingService: ImageProcessingService;
	videoProcessingService: VideoProcessingService;
	internalStorageService: InternalStorageService;
	logger: Logger;
};

class HonoFileReply implements FileServerReply {
	public statusCode = 200;
	public readonly headers = new Headers({
		'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
	});

	constructor() {
		if (process.env['NODE_ENV'] === 'development') {
			this.headers.set('Access-Control-Allow-Origin', '*');
		}
	}

	public code(statusCode: number): this {
		this.statusCode = statusCode;
		return this;
	}

	public header(name: string, value: string | number | undefined): this {
		if (value !== undefined) {
			this.headers.set(name, String(value));
		}
		return this;
	}

	public redirect(url: string, statusCode = 302): null {
		this.statusCode = statusCode;
		this.headers.set('Location', url);
		return null;
	}

	public sendFile(path: string, root: string): FileBody {
		const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
		this.headers.set('Cache-Control', 'public, max-age=0');
		return {
			type: 'file',
			path: resolve(root, normalizedPath),
		};
	}
}

function createFileServerRequest<Params extends Record<string, string>, Query extends Record<string, unknown>>(
	c: Context,
	params: Params,
	query = c.req.query() as Query,
): FileServerRequest<Params, Query> {
	const headers: FileServerHeaders = {};

	c.req.raw.headers.forEach((value, key) => {
		headers[key.toLowerCase()] = value;
	});

	return {
		params,
		query,
		headers,
	};
}

function createRedirectToOmitSearch(c: Context, reply: HonoFileReply): Response | null {
	const url = new URL(c.req.url);
	if (url.search === '') return null;

	reply.redirect(url.pathname, 301);
	return new Response(null, {
		status: reply.statusCode,
		headers: reply.headers,
	});
}

function isFileBody(value: unknown): value is FileBody {
	return typeof value === 'object' && value !== null && (value as FileBody).type === 'file';
}

function isReadable(value: unknown): value is NodeJS.ReadableStream {
	return (
		typeof value === 'object' &&
		value !== null &&
		'pipe' in value &&
		typeof (value as { pipe?: unknown }).pipe === 'function'
	);
}

async function fileBodyToResponse(body: FileBody, reply: HonoFileReply, method: string): Promise<Response> {
	const fileStat = await stat(body.path).catch(() => null);
	if (fileStat == null || !fileStat.isFile()) {
		return new Response(null, {
			status: 404,
			headers: reply.headers,
		});
	}

	reply.headers.set('Content-Length', String(fileStat.size));
	const contentType = mime.lookup(body.path);
	if (contentType) {
		reply.headers.set('Content-Type', contentType);
	}

	return new Response(
		method === 'HEAD' ? null : (Readable.toWeb(createReadStream(body.path)) as ReadableStream<Uint8Array>),
		{
			status: reply.statusCode,
			headers: reply.headers,
		},
	);
}

async function toResponse(body: unknown, reply: HonoFileReply, method: string): Promise<Response> {
	if (isFileBody(body)) {
		return await fileBodyToResponse(body, reply, method);
	}

	if (body == null || method === 'HEAD') {
		return new Response(null, {
			status: reply.statusCode,
			headers: reply.headers,
		});
	}

	if (typeof body === 'string' || body instanceof Uint8Array) {
		return new Response(body, {
			status: reply.statusCode,
			headers: reply.headers,
		});
	}

	if (isReadable(body)) {
		return new Response(Readable.toWeb(body as Readable) as ReadableStream<Uint8Array>, {
			status: reply.statusCode,
			headers: reply.headers,
		});
	}

	return new Response(null, {
		status: reply.statusCode,
		headers: reply.headers,
	});
}

async function errorHandler(
	request: FileServerRequest<Record<string, string>, Record<string, unknown>>,
	reply: HonoFileReply,
	assetsPath: string,
	logger: Logger,
	err: unknown,
): Promise<unknown> {
	logger.error(`${err}`);
	reply.header('Cache-Control', 'max-age=300');

	if (request.query && 'fallback' in request.query) {
		return reply.sendFile('/dummy.png', assetsPath);
	}

	if (err instanceof StatusError && (err.statusCode === 302 || err.isClientError)) {
		reply.code(err.statusCode);
		return;
	}

	reply.code(500);
	return undefined;
}

export function createFileServerApp(deps: FileServerDependencies): Hono {
	const app = new Hono();
	const assetsPath = resolve(deps.config.runtime.rootDir, 'packages/backend/src/server/assets');
	const fileResolver = new FileServerFileResolver(
		deps.db,
		deps.fileInfoService,
		deps.downloadService,
		deps.internalStorageService,
	);
	const driveHandler = new FileServerDriveHandler(deps.config, fileResolver, assetsPath, deps.videoProcessingService);
	const proxyHandler = new FileServerProxyHandler(deps.config, fileResolver, assetsPath, deps.imageProcessingService);

	app.get('/files/:key', async (c) => {
		const reply = new HonoFileReply();
		const redirect = createRedirectToOmitSearch(c, reply);
		if (redirect) return redirect;

		// static ルートと :param ルートを同じセグメント位置に置くと RegExpRouter 非対応のため、
		// app-default.jpg をこのルートで処理してアプリ全体の TrieRouter フォールバックを避ける。
		if (c.req.param('key') === 'app-default.jpg') {
			reply.header('Content-Type', 'image/jpeg');
			reply.header('Cache-Control', 'max-age=31536000, immutable');
			return await toResponse(createReadStream(resolve(assetsPath, 'dummy.png')), reply, c.req.method);
		}

		const request = createFileServerRequest(c, { key: c.req.param('key') });
		const body = await driveHandler
			.handle(request, reply)
			.catch((err) => errorHandler(request, reply, assetsPath, deps.logger, err));
		return await toResponse(body, reply, c.req.method);
	});

	app.get('/files/:key/*', async (c) => {
		const reply = new HonoFileReply();
		const redirect = createRedirectToOmitSearch(c, reply);
		if (redirect) return redirect;

		reply.redirect(`${deps.config.instance.url}/files/${c.req.param('key')}`, 301);
		return await toResponse(null, reply, c.req.method);
	});

	// 複数セグメントを跨ぐ正規表現パラメータは RegExpRouter 非対応のため、ワイルドカードで受けて
	// パスから URL を切り出す。percent-decode はパラメータ抽出と同じ挙動になるよう自前で行う。
	app.get('/proxy/*', async (c) => {
		const reply = new HonoFileReply();
		const rawUrl = c.req.path.slice('/proxy/'.length);
		let url = rawUrl;
		try {
			url = decodeURIComponent(rawUrl);
		} catch {
			// 不正な percent-encoding はデコードせず、そのまま扱う。
		}
		const request = createFileServerRequest(c, { url });
		const body = await proxyHandler
			.handle(request, reply)
			.catch((err) => errorHandler(request, reply, assetsPath, deps.logger, err));
		return await toResponse(body, reply, c.req.method);
	});

	return app;
}
