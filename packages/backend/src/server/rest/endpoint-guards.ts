/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

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
import { assertApiRateLimitForUser } from './rate-limit.js';
import type { ApiEndpointRateLimit } from './rate-limit.js';
import { rolePermissionDeniedError } from './error.js';
import { hasApiRolePolicyOrIsRoot } from './role/role-policy.js';

/** 認証を通した後の資格情報。requireCredential のエンドポイントでは user が非 null。 */
export type AuthedCredential = { user: MiLocalUser; token: MiAccessToken | null };

export type EndpointGuardDependencies = Parameters<typeof authenticateApiToken>[0] &
	Parameters<typeof assertApiModerator>[0] &
	Parameters<typeof assertApiRateLimitForUser>[0];

/** 共通 guard が読む meta の項目。 */
export type EndpointGuardMeta = {
	readonly requireCredential?: boolean;
	readonly requireModerator?: boolean;
	readonly requireAdmin?: boolean;
	readonly secure?: boolean;
	readonly prohibitMoved?: boolean;
	readonly requireRolePolicy?: string;
	readonly kind?: string;
	readonly limit?: ApiEndpointRateLimit;
};

/**
 * meta から認証・権限・モデレーター判定・利用者単位の回数制限を組み立てて実行する。
 * 未認証でも通るエンドポイントの制限は IP 単位で、呼び出し側が別途掛ける。
 */
export async function applyEndpointGuards(
	deps: EndpointGuardDependencies,
	name: string,
	meta: EndpointGuardMeta,
	auth: ApiAuthenticated,
): Promise<void> {
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
		const policy = meta.requireRolePolicy as Parameters<typeof hasApiRolePolicyOrIsRoot>[2];
		if (!(await hasApiRolePolicyOrIsRoot(deps, (auth as AuthedCredential).user, policy))) {
			throw rolePermissionDeniedError();
		}
	}

	if (meta.requireAdmin === true) {
		await assertApiAdmin(deps, auth as AuthedCredential);
	} else if (meta.requireModerator === true) {
		await assertApiModerator(deps, auth as AuthedCredential);
	}

	if (meta.limit != null && auth.user != null) {
		await assertApiRateLimitForUser(deps, name, meta.limit, auth.user);
	}
}
