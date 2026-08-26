/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	fetchAccessTokenByHashOrTokenFromDatabase,
	updateAccessTokenLastUsedAtInDatabase,
} from '@/core/app/AccessTokenStore.js';
import { fetchAppByIdOrFailFromDatabase } from '@/core/app/AppStore.js';
import { fetchLocalUserByIdFromDatabase, fetchLocalUserByNativeTokenFromDatabase } from '@/core/user/UserStore.js';
import { deserializeAccessToken } from '@/db/schema/access-token.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { isNativeUserToken } from '@/misc/token.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type { MiLocalUser } from '@/models/User.js';
import {
	accessDeniedError,
	accountMovedError,
	authenticationFailedError,
	credentialRequiredError,
	permissionDeniedError,
	userSuspendedError,
} from '../error.js';

export type HonoApiAuthDependencies = {
	db: MiDrizzleDatabase;
};

export type HonoApiAuthenticated = {
	user: MiLocalUser | null;
	token: MiAccessToken | null;
};

export async function authenticateHonoApiToken(
	deps: HonoApiAuthDependencies,
	token: string | null | undefined,
): Promise<HonoApiAuthenticated> {
	if (token == null) {
		return { user: null, token: null };
	}

	if (isNativeUserToken(token)) {
		const user = await fetchLocalUserByNativeTokenFromDatabase(deps.db, token);
		if (user == null) throw authenticationFailedError();

		return { user, token: null };
	}

	const accessToken = await fetchAccessTokenByHashOrTokenFromDatabase(deps.db, token.toLowerCase(), token);
	if (accessToken == null) throw authenticationFailedError();

	void updateAccessTokenLastUsedAtInDatabase(deps.db, accessToken.id, new Date());

	const user = await fetchLocalUserByIdFromDatabase(deps.db, accessToken.userId);
	if (user == null) throw authenticationFailedError();

	if (accessToken.appId != null) {
		const app = await fetchAppByIdOrFailFromDatabase(deps.db, accessToken.appId);
		return {
			user,
			token: {
				id: accessToken.id,
				name: accessToken.name,
				iconUrl: accessToken.iconUrl,
				permission: app.permission,
			} as MiAccessToken,
		};
	}

	return {
		user,
		token: deserializeAccessToken(accessToken),
	};
}

export function assertCredential(auth: HonoApiAuthenticated): asserts auth is {
	user: MiLocalUser;
	token: MiAccessToken | null;
} {
	if (auth.user == null) throw credentialRequiredError();
	if (auth.user.isSuspended) throw userSuspendedError();
}

export function assertOptionalCredential(auth: HonoApiAuthenticated): void {
	if (auth.user?.isSuspended) throw userSuspendedError();
}

export function assertTokenPermission(auth: { token: MiAccessToken | null }, permission: string): void {
	if (auth.token != null && !auth.token.permission.includes(permission)) {
		throw permissionDeniedError();
	}
}

export function assertSecureCredential(auth: { user: MiLocalUser; token: MiAccessToken | null }): void {
	if (auth.token != null) throw accessDeniedError();
}

export function assertProhibitMoved(user: MiLocalUser): void {
	if (user.movedToUri != null) throw accountMovedError();
}
