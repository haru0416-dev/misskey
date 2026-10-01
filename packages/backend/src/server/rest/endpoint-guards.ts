/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { getIpHash } from '@/misc/get-ip-hash.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type { MiLocalUser } from '@/models/User.js';
import {
	assertCredential,
	assertOptionalCredential,
	assertProhibitMoved,
	assertSecureCredential,
	assertTokenPermission,
} from './auth/auth.js';
import type { ApiAuthenticated, authenticateApiToken } from './auth/auth.js';
import { assertApiAdmin, assertApiModerator } from './shell-helpers.js';
import { assertApiRateLimit, assertApiRateLimitForUser } from './rate-limit.js';
import type { ApiEndpointRateLimit } from './rate-limit.js';
import { rolePolicyRequiredError } from './error.js';
import { hasRequiredRolePolicy } from '../../core/role/role-policy.js';

/** 認証を通した後の資格情報。requireCredential のエンドポイントでは user が非 null。 */
export type AuthedCredential = { user: MiLocalUser; token: MiAccessToken | null };

export type EndpointGuardDependencies = Parameters<typeof authenticateApiToken>[0] &
	Parameters<typeof assertApiModerator>[0] &
	Parameters<typeof assertApiRateLimitForUser>[0];

export type EndpointGuardMeta = {
	readonly requireCredential?: boolean;
	readonly requireModerator?: boolean;
	readonly requireAdmin?: boolean;
	readonly secure?: boolean;
	readonly prohibitMoved?: boolean;
	readonly requiredRolePolicy?: string;
	readonly kind?: string;
	readonly limit?: ApiEndpointRateLimit;
};

/**
 * meta から認証・権限・モデレーター判定・回数制限を組み立てて実行する。
 * 回数制限はログイン中なら利用者単位 (ロールの倍率つき)、匿名なら IP 単位 (IPv6 は /64) で数える。
 */
export async function applyEndpointGuards(
	deps: EndpointGuardDependencies,
	name: string,
	meta: EndpointGuardMeta,
	auth: ApiAuthenticated,
	/** 匿名で回数制限があるときだけ呼ぶ。 */
	requestIp: () => string,
): Promise<void> {
	if (meta.requireCredential === true || meta.requireModerator === true || meta.requireAdmin === true) {
		assertCredential(auth);
	} else {
		assertOptionalCredential(auth);
	}

	if (meta.secure === true) {
		assertSecureCredential(auth as AuthedCredential);
	}

	if (meta.prohibitMoved === true) {
		assertProhibitMoved((auth as AuthedCredential).user);
	}

	if (meta.requireAdmin === true) {
		await assertApiAdmin(deps, auth as AuthedCredential);
	} else if (meta.requireModerator === true) {
		await assertApiModerator(deps, auth as AuthedCredential);
	}

	if (meta.requiredRolePolicy != null) {
		const policy = meta.requiredRolePolicy as Parameters<typeof hasRequiredRolePolicy>[2];
		if (!(await hasRequiredRolePolicy(deps, auth.user, policy))) {
			throw rolePolicyRequiredError();
		}
	}

	// scope はロールの判定の後に見る。権限の足りないトークンを使った非管理者には ROLE_PERMISSION_DENIED を返す (upstream と同じ順)。
	if (meta.kind != null && meta.kind !== 'server') {
		assertTokenPermission(auth, meta.kind);
	}

	if (meta.limit != null) {
		if (auth.user != null) {
			await assertApiRateLimitForUser(deps, name, meta.limit, auth.user);
		} else {
			await assertApiRateLimit(deps, name, meta.limit, getIpHash(requestIp()));
		}
	}
}
