/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Hono, type Context } from 'hono';
import { UrlPreviewService, type UrlPreviewReply, type UrlPreviewRequest } from './UrlPreviewService.js';

export type UrlPreviewDependencies = {
	urlPreviewService: UrlPreviewService;
};

class CollectedUrlPreviewReply implements UrlPreviewReply {
	public statusCode = 200;
	public readonly headers = new Headers();

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
}

function queryValue(c: Context, name: string): unknown {
	const values = new URL(c.req.url).searchParams.getAll(name);
	if (values.length === 0) return undefined;
	if (values.length === 1) return values[0];
	return values;
}

function createUrlPreviewRequest(c: Context): UrlPreviewRequest {
	return {
		query: {
			url: queryValue(c, 'url'),
			lang: queryValue(c, 'lang'),
		},
	};
}

function toResponse(body: object | undefined, reply: CollectedUrlPreviewReply): Response {
	if (body == null) {
		return new Response(null, {
			status: reply.statusCode,
			headers: reply.headers,
		});
	}

	const headers = new Headers(reply.headers);
	headers.set('Content-Type', 'application/json; charset=utf-8');

	return new Response(JSON.stringify(body), {
		status: reply.statusCode,
		headers,
	});
}

export function createUrlPreviewApp(deps: UrlPreviewDependencies): Hono {
	const app = new Hono();

	app.get('/url', async (c) => {
		const reply = new CollectedUrlPreviewReply();
		const body = await deps.urlPreviewService.handle(createUrlPreviewRequest(c), reply);
		return toResponse(body, reply);
	});

	return app;
}
