/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Hono } from 'hono';
import type { Config } from '@/config.js';
import { ApiDocPage } from './api/openapi/api-doc.js';
import { genOpenapiSpec } from './api/openapi/gen-spec.js';

export type OpenApiDependencies = {
	config: Config;
};

export function createOpenApiApp(deps: OpenApiDependencies): Hono {
	const app = new Hono();

	app.get('/api-doc', async () => {
		return new Response(String(await ApiDocPage()), {
			status: 200,
			headers: {
				'Cache-Control': 'public, max-age=86400',
				'Content-Type': 'text/html; charset=utf-8',
			},
		});
	});

	app.get('/api.json', () => {
		return new Response(JSON.stringify(genOpenapiSpec(deps.config)), {
			status: 200,
			headers: {
				'Cache-Control': 'public, max-age=600',
				'Content-Type': 'application/json; charset=utf-8',
			},
		});
	});

	return app;
}
