/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Context } from 'hono';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type { MiLocalUser } from '@/models/User.js';
import { endpointMetas } from '@/server/api/endpoint-metas.js';
import {
	assertCredential,
	assertOptionalCredential,
	assertProhibitMoved,
	assertSecureCredential,
	assertTokenPermission,
	authenticateApiToken,
	type ApiAuthenticated,
} from './auth/auth.js';
import { assertApiAdmin, assertApiModerator, jsonBody, runApiEndpoint, tokenFromRequest } from './shell-helpers.js';
import { assertApiRateLimitForUser, type ApiEndpointRateLimit } from './rate-limit.js';
import { rolePermissionDeniedError } from './error.js';
import { hasApiRolePolicyOrIsRoot } from './role/role-policy.js';

/** 認証を通した後の資格情報。requireCredential のエンドポイントでは user が非 null。 */
export type AuthedCredential = { user: MiLocalUser; token: MiAccessToken | null };

/**
 * エンドポイント定義から認証・権限・モデレーター判定を組み立てて実行する。
 *
 * 認証・権限条件は endpoint-metas を唯一の定義元とする。
 * レートリミットは呼び出しごとに上限値が異なるため、呼び出し側で指定する。
 */
export async function withEndpointGuards<T>(
	c: Context,
	deps: Parameters<typeof authenticateApiToken>[0] &
		Parameters<typeof assertApiModerator>[0] &
		Parameters<typeof assertApiRateLimitForUser>[0],
	name: keyof typeof endpointMetas,
	run: (args: { body: Record<string, unknown>; auth: ApiAuthenticated }) => Promise<T>,
): Promise<T> {
	const meta = endpointMetas[name].meta as {
		requireCredential?: boolean;
		requireModerator?: boolean;
		requireAdmin?: boolean;
		secure?: boolean;
		prohibitMoved?: boolean;
		requireRolePolicy?: Parameters<typeof hasApiRolePolicyOrIsRoot>[2];
		kind?: string;
		limit?: ApiEndpointRateLimit;
	};

	const body = await jsonBody(c);
	const auth = await authenticateApiToken(deps, tokenFromRequest(c, body));

	if (meta.requireCredential === true || meta.requireModerator === true || meta.requireAdmin === true) {
		assertCredential(auth);
	} else {
		assertOptionalCredential(auth);
	}

	if (meta.secure === true) {
		assertSecureCredential(auth as AuthedCredential);
	}

	if (meta.kind != null && meta.kind !== 'server') {
		assertTokenPermission(auth, meta.kind);
	}

	if (meta.prohibitMoved === true) {
		assertProhibitMoved((auth as AuthedCredential).user);
	}

	if (meta.requireRolePolicy != null) {
		if (!(await hasApiRolePolicyOrIsRoot(deps, (auth as AuthedCredential).user, meta.requireRolePolicy))) {
			throw rolePermissionDeniedError();
		}
	}

	if (meta.requireAdmin === true) {
		await assertApiAdmin(deps, auth as AuthedCredential);
	} else if (meta.requireModerator === true) {
		await assertApiModerator(deps, auth as AuthedCredential);
	}

	// レートリミットは資格情報を要するものだけ meta から適用する。未認証でも通る
	// エンドポイントの制限は IP 単位で、呼び出し側が別途掛けている。
	if (meta.limit != null && auth.user != null) {
		await assertApiRateLimitForUser(deps, name, meta.limit, auth.user);
	}

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
