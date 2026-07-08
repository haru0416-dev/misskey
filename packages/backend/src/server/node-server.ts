/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Hono } from 'hono';

export type HonoNodeServerOptions = {
	app: Pick<Hono, 'fetch'>;
};

function requestUrl(req: IncomingMessage): URL {
	const host = req.headers.host ?? 'localhost';
	return new URL(req.url ?? '/', `http://${host}`);
}

function requestHeaders(req: IncomingMessage): Headers {
	const headers = new Headers();

	for (const [key, value] of Object.entries(req.headers)) {
		if (value == null) continue;

		if (Array.isArray(value)) {
			for (const item of value) {
				headers.append(key, item);
			}
		} else {
			headers.set(key, value);
		}
	}

	if (req.socket.remoteAddress != null && !headers.has('x-misskey-remote-address')) {
		headers.set('x-misskey-remote-address', req.socket.remoteAddress);
	}

	return headers;
}

function requestBody(req: IncomingMessage): ReadableStream<Uint8Array> | undefined {
	if (req.method === 'GET' || req.method === 'HEAD') return undefined;
	return Readable.toWeb(req) as ReadableStream<Uint8Array>;
}

function toRequest(req: IncomingMessage): Request {
	return new Request(requestUrl(req), {
		method: req.method,
		headers: requestHeaders(req),
		body: requestBody(req),
		duplex: 'half',
	} as RequestInit & { duplex: 'half' });
}

async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
	res.statusCode = response.status;
	response.headers.forEach((value, key) => res.setHeader(key, value));

	if (response.body == null) {
		res.end();
		return;
	}

	// res.write の戻り値を無視した for-await ループだと、遅いクライアントに大きなボディを
	// 送るときに書き込みバッファが無制限に膨らむ。pipeline はbackpressure (drain待ち) と
	// クライアント切断時の上流ストリーム破棄を面倒みてくれる。
	await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>), res);
}

export function createHonoNodeServer(options: HonoNodeServerOptions): Server {
	return createServer(async (req, res) => {
		try {
			await writeResponse(res, await options.app.fetch(toRequest(req)));
		} catch (err) {
			// ボディ送信中の失敗 (クライアント切断等) はヘッダ送信済みでレスポンスを書き換えられない
			if (res.headersSent) {
				res.destroy();
				return;
			}
			res.statusCode = 500;
			res.setHeader('content-type', 'text/plain; charset=utf-8');
			res.end(err instanceof Error ? err.message : String(err));
		}
	});
}
