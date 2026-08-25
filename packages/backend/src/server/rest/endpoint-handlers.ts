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
	authenticateHonoApiToken,
	type HonoApiAuthenticated,
} from './auth.js';
import {
	assertHonoApiAdmin,
	assertHonoApiModerator,
	jsonBody,
	runApiEndpoint,
	tokenFromRequest,
} from './shell-helpers.js';
import { assertHonoApiRateLimitForUser, type HonoApiEndpointRateLimit } from './rate-limit.js';
import { rolePermissionDeniedError } from './error.js';
import { hasHonoApiRolePolicyOrIsRoot } from './role-policy.js';

/** 認証を通した後の資格情報。requireCredential のエンドポイントでは user が非 null。 */
export type AuthedCredential = { user: MiLocalUser; token: MiAccessToken | null };

/**
 * エンドポイント定義から認証・権限・モデレーター判定を組み立てて実行する。
 *
 * これらの条件は endpoint-metas 側に既に宣言されているのに、ルート登録では手書きで
 * 書き写していた。同じ情報が2箇所にあると、片方だけ変えても気付けない (実際 kind を
 * 宣言しながら assertSecureCredential でアプリトークンを全拒否している、宣言した権限が
 * 使えないエンドポイントが11本あった)。宣言を単一の出所にする。
 *
 * レートリミットは呼び出しごとに上限値が違い meta では表現しきれないため、
 * 従来どおり呼び出し側で指定する。
 */
export async function withEndpointGuards<T>(
	c: Context,
	deps: Parameters<typeof authenticateHonoApiToken>[0] &
		Parameters<typeof assertHonoApiModerator>[0] &
		Parameters<typeof assertHonoApiRateLimitForUser>[0],
	name: keyof typeof endpointMetas,
	run: (args: { body: Record<string, unknown>; auth: HonoApiAuthenticated }) => Promise<T>,
): Promise<T> {
	const meta = endpointMetas[name].meta as {
		requireCredential?: boolean;
		requireModerator?: boolean;
		requireAdmin?: boolean;
		secure?: boolean;
		prohibitMoved?: boolean;
		requireRolePolicy?: Parameters<typeof hasHonoApiRolePolicyOrIsRoot>[2];
		kind?: string;
		limit?: HonoApiEndpointRateLimit;
	};

	const body = await jsonBody(c);
	const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));

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
		if (!(await hasHonoApiRolePolicyOrIsRoot(deps, (auth as AuthedCredential).user, meta.requireRolePolicy))) {
			throw rolePermissionDeniedError();
		}
	}

	if (meta.requireAdmin === true) {
		await assertHonoApiAdmin(deps, auth as AuthedCredential);
	} else if (meta.requireModerator === true) {
		await assertHonoApiModerator(deps, auth as AuthedCredential);
	}

	// レートリミットは資格情報を要するものだけ meta から適用する。未認証でも通る
	// エンドポイントの制限は IP 単位で、呼び出し側が別途掛けている。
	if (meta.limit != null && auth.user != null) {
		await assertHonoApiRateLimitForUser(deps, name, meta.limit, auth.user);
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
	run: (args: { body: Record<string, unknown>; auth: HonoApiAuthenticated; c: Context }) => Promise<T>,
): (c: Context) => Promise<Response> {
	return async (c: Context) =>
		(await runApiEndpoint(
			c,
			async () =>
				(await withEndpointGuards(c, deps, name, async ({ body, auth }) => run({ body, auth, c }))) as Response,
		)) as Response;
}
