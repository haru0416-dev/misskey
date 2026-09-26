/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Context } from 'hono';
import { endpointMetas } from '@/server/api/endpoint-metas.js';
import { authenticateApiToken } from './auth/auth.js';
import type { ApiAuthenticated } from './auth/auth.js';
import { applyEndpointGuards } from './endpoint-guards.js';
import type { AuthedCredential, EndpointGuardDependencies, EndpointGuardMeta } from './endpoint-guards.js';
import { jsonBody, runApiEndpoint, tokenFromRequest } from './shell-helpers.js';

export type { AuthedCredential } from './endpoint-guards.js';

/**
 * エンドポイント定義から認証・権限・モデレーター判定を組み立てて実行する。
 * 認証・権限条件は endpoint-metas を唯一の定義元とする。
 */
export async function withEndpointGuards<T>(
	c: Context,
	deps: EndpointGuardDependencies,
	name: keyof typeof endpointMetas,
	run: (args: { body: Record<string, unknown>; auth: ApiAuthenticated }) => Promise<T>,
): Promise<T> {
	const body = await jsonBody(c);
	const auth = await authenticateApiToken(deps, tokenFromRequest(c, body));
	await applyEndpointGuards(deps, name, endpointMetas[name].meta as EndpointGuardMeta, auth);
	return await run({ body, auth });
}

/**
 * 資格情報を必須とするエンドポイント向け。`auth.user` は検査済みなので非 null で渡す。
 *
 * `assertCredential` の型の絞り込みは withEndpointGuards の外へ伝わらないため、
 * 必須であることを関数名で表明して型を確定させる。meta が requireCredential を宣言して
 * いなければ実行時に検査が走らないので、宣言と呼び出し形が食い違えば contract テストで
 * 落ちる (endpointHandler / endpointHandlerAnonymous の取り違えを検出する)。
 */
export function endpointHandler<T>(
	deps: Parameters<typeof withEndpointGuards>[1],
	name: keyof typeof endpointMetas,
	run: (args: { body: Record<string, unknown>; auth: AuthedCredential; c: Context }) => Promise<T>,
): (c: Context) => Promise<Response> {
	return async (c: Context) =>
		(await runApiEndpoint(
			c,
			async () =>
				(await withEndpointGuards(c, deps, name, async ({ body, auth }) =>
					run({ body, auth: auth as AuthedCredential, c }),
				)) as Response,
		)) as Response;
}

/** 未認証でも通るエンドポイント向け。`auth.user` は null になり得る。 */
export function endpointHandlerAnonymous<T>(
	deps: Parameters<typeof withEndpointGuards>[1],
	name: keyof typeof endpointMetas,
	run: (args: { body: Record<string, unknown>; auth: ApiAuthenticated; c: Context }) => Promise<T>,
): (c: Context) => Promise<Response> {
	return async (c: Context) =>
		(await runApiEndpoint(
			c,
			async () =>
				(await withEndpointGuards(c, deps, name, async ({ body, auth }) => run({ body, auth, c }))) as Response,
		)) as Response;
}
