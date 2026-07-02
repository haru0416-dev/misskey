/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Hono, type Context } from 'hono';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/_.js';
import { listActiveInstanceHostsFromDatabase } from '@/core/InstanceStore.js';
import { SignupApiError, signupWithHonoApi, type SignupInternalEventPublisher } from './hono-api-signup.js';

export type ApiShellDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	publishInternalEvent?: SignupInternalEventPublisher;
};

const unknownApiEndpoint = {
	error: {
		message: 'Unknown API endpoint.',
		code: 'UNKNOWN_API_ENDPOINT',
		id: '2ca3b769-540a-4f08-9dd5-b5a825b6d0f1',
		kind: 'client',
	},
};

const invalidJsonBody = {
	error: {
		message: 'Invalid JSON body.',
		code: 'INVALID_PARAM',
		id: '0b5f1631-7c1a-41a6-b399-cce335f34d85',
		kind: 'client',
	},
};

function apiErrorBody(err: SignupApiError): { error: { message: string; code: string; id: string; kind: 'client'; }; } {
	return {
		error: {
			message: err.message,
			code: err.code,
			id: 'b973e8da-5e72-4efd-8de0-822ae5e4cfc7',
			kind: 'client',
		},
	};
}

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

	app.post('/signup', async (c) => {
		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return jsonResponse(c, invalidJsonBody, 400);
		}

		try {
			return jsonResponse(c, await signupWithHonoApi(deps, body ?? {}));
		} catch (err) {
			if (err instanceof SignupApiError) {
				return jsonResponse(c, apiErrorBody(err), err.status);
			}

			throw err;
		}
	});

	app.all('/clear-browser-cache', (c) => {
		if (c.req.method === 'GET' || c.req.method === 'POST') {
			c.header('Clear-Site-Data', '"cache", "prefetchCache", "prerenderCache", "executionContexts"');
			return c.body(null, 204);
		}

		return c.body(null, 405);
	});

	app.all('/*', (c) => jsonResponse(c, unknownApiEndpoint, 404));

	app.notFound((c) => {
		setApiHeaders(c);
		return c.body('404 Not Found', 404);
	});

	return app;
}
