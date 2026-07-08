/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readRequestBodyWithLimit } from '../body-limit.js';
import { Hono, type Context } from 'hono';
import {
	parseUrlEncodedParameters,
	toRequestParameters,
	type OAuthProviderRuntime,
	type OAuthRequestParameters,
} from './OAuthProviderRuntime.js';

export type OAuthDependencies = {
	runtime: OAuthProviderRuntime;
};

function queryParameters(c: Context): OAuthRequestParameters {
	return parseUrlEncodedParameters(new URL(c.req.url).searchParams.toString());
}

// OAuth のリクエストボディは小さいので upstream の JSON bodyLimit と同じ 1 MiB で頭打ちにする
// (c.req.json()/text() は無制限にメモリへ読むため)。超過・パース失敗はいずれも「パラメータ無し」
// として下流の invalid_request 系エラーに流す。
const OAUTH_BODY_LIMIT = 1024 * 1024;
const oauthTextDecoder = new TextDecoder();

async function bodyParameters(c: Context): Promise<OAuthRequestParameters> {
	class BodyLimitExceeded extends Error {}
	let raw: Uint8Array;
	try {
		raw = await readRequestBodyWithLimit(c, OAUTH_BODY_LIMIT, () => new BodyLimitExceeded());
	} catch (err) {
		if (err instanceof BodyLimitExceeded) return toRequestParameters(null);
		throw err;
	}

	const contentType = c.req.header('content-type')?.split(';')[0].trim().toLowerCase();
	if (contentType === 'application/json') {
		let parsed: unknown = null;
		try {
			parsed = JSON.parse(oauthTextDecoder.decode(raw));
		} catch {
			parsed = null;
		}
		return toRequestParameters(parsed);
	}

	return parseUrlEncodedParameters(oauthTextDecoder.decode(raw));
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
