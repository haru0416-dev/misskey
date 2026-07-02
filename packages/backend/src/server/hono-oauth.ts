/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Hono, type Context } from 'hono';
import {
	parseUrlEncodedParameters,
	toRequestParameters,
	type OAuthProviderRuntime,
	type OAuthRequestParameters,
} from './oauth/OAuthProviderRuntime.js';

export type OAuthDependencies = {
	runtime: OAuthProviderRuntime;
};

function queryParameters(c: Context): OAuthRequestParameters {
	return parseUrlEncodedParameters(new URL(c.req.url).searchParams.toString());
}

async function bodyParameters(c: Context): Promise<OAuthRequestParameters> {
	const contentType = c.req.header('content-type')?.split(';')[0].trim().toLowerCase();
	if (contentType === 'application/json') {
		return toRequestParameters(await c.req.json().catch(() => null));
	}

	return parseUrlEncodedParameters(await c.req.text());
}

export function createOAuthApp(deps: OAuthDependencies): Hono {
	const app = new Hono();

	app.get('/authorize', async (c) => await deps.runtime.authorize(queryParameters(c)));
	app.post('/decision', async (c) => await deps.runtime.decision(await bodyParameters(c)));
	app.options('/token', () => deps.runtime.tokenOptions());
	app.post('/token', async (c) => await deps.runtime.token(await bodyParameters(c)));
	app.all('*', () => deps.runtime.unknownEndpoint());

	return app;
}
