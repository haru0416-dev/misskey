/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Hono, type Context } from 'hono';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { listActiveInstanceHostsFromDatabase } from '@/core/InstanceStore.js';

export type ApiShellDependencies = {
	db: MiDrizzleDatabase;
};

const unknownApiEndpoint = {
	error: {
		message: 'Unknown API endpoint.',
		code: 'UNKNOWN_API_ENDPOINT',
		id: '2ca3b769-540a-4f08-9dd5-b5a825b6d0f1',
		kind: 'client',
	},
};

function setApiHeaders(c: Context): void {
	c.header('Access-Control-Allow-Origin', '*');
	c.header('Cache-Control', 'private, max-age=0, must-revalidate');
}

function jsonResponse(c: Context, body: unknown, status = 200): Response {
	setApiHeaders(c);
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'private, max-age=0, must-revalidate',
			'Content-Type': 'application/json; charset=utf-8',
		},
	});
}

export function createApiShellApp(deps: ApiShellDependencies): Hono {
	const app = new Hono();

	app.use('*', async (c, next) => {
		setApiHeaders(c);
		await next();
	});

	app.options('*', (c) => {
		c.header('Access-Control-Allow-Methods', 'GET,HEAD,POST,OPTIONS');
		const requestedHeaders = c.req.header('Access-Control-Request-Headers');
		if (requestedHeaders != null) {
			c.header('Access-Control-Allow-Headers', requestedHeaders);
		}
		return c.body(null, 204);
	});

	app.get('/v1/instance/peers', async (c) => {
		return jsonResponse(c, await listActiveInstanceHostsFromDatabase(deps.db));
	});

	app.all('/clear-browser-cache', (c) => {
		if (c.req.method === 'GET' || c.req.method === 'POST') {
			c.header('Clear-Site-Data', '"cache", "prefetchCache", "prerenderCache", "executionContexts"');
			return c.body(null, 204);
		}

		return c.body(null, 405);
	});

	app.get('/*', (c) => jsonResponse(c, unknownApiEndpoint, 404));

	app.notFound((c) => {
		setApiHeaders(c);
		return c.body('404 Not Found', 404);
	});

	return app;
}
