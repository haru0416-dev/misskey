/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Hono } from 'hono';
import type { Config } from '@/config.js';

export type OpenApiDependencies = {
	config: Config;
};

export function createOpenApiApp(deps: OpenApiDependencies): Hono {
	const app = new Hono();
	let apiDocHtmlPromise: Promise<string> | undefined;
	let openApiJsonPromise: Promise<string> | undefined;

	app.get('/api-doc', async () => {
		apiDocHtmlPromise ??= import('./api/openapi/api-doc.js').then(async ({ ApiDocPage }) => String(await ApiDocPage()));
		return new Response(await apiDocHtmlPromise, {
			status: 200,
			headers: {
				'Cache-Control': 'public, max-age=86400',
				'Content-Type': 'text/html; charset=utf-8',
			},
		});
	});

	app.get('/api.json', async () => {
		openApiJsonPromise ??= import('./api/openapi/gen-spec.js').then(({ genOpenapiSpec }) =>
			JSON.stringify(genOpenapiSpec(deps.config)),
		);
		return new Response(await openApiJsonPromise, {
			status: 200,
			headers: {
				'Cache-Control': 'public, max-age=600',
				'Content-Type': 'application/json; charset=utf-8',
			},
		});
	});

	return app;
}
