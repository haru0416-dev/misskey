/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import {
	createAccessTokenInDatabase,
	fetchAccessTokenBySessionFromDatabase,
	markAccessTokenFetchedInDatabase,
} from '@/core/app/AccessTokenStore.js';
import type { Config } from '@/config.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/user/UserStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import { uniqueItems } from '@/misc/zod-params.js';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import { createTokenNotification, type ApiNotificationDependencies } from '../notification/notification.js';
import { packUserDetailedNotMeForApi } from '../user/user.js';
import { parseApiParams } from '../validation.js';

export type ApiMiauthDependencies = ApiNotificationDependencies & {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
};

type MiauthGenTokenBody = {
	session: string | null;
	name?: string | null;
	description?: string | null;
	iconUrl?: string | null;
	permission: string[];
};

export const miauthGenTokenParamDef = z.object({
	session: z.string().nullable(),
	name: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	iconUrl: z.string().nullable().optional(),
	permission: uniqueItems(z.array(z.string())),
});

export async function handleApiMiauthGenToken(
	deps: ApiMiauthDependencies,
	user: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ token: string }> {
	const params = parseApiParams(miauthGenTokenParamDef, body);
	const accessToken = secureRndstr(32);
	const now = new Date();

	await createAccessTokenInDatabase(deps.db, {
		id: genId(now.getTime()),
		lastUsedAt: now,
		session: params.session,
		userId: user.id,
		token: accessToken,
		hash: accessToken,
		name: params.name,
		description: params.description,
		iconUrl: params.iconUrl,
		permission: params.permission,
	});

	createTokenNotification(deps, user.id);

	return {
		token: accessToken,
	};
}

export async function handleApiMiauthCheck(
	deps: ApiMiauthDependencies,
	session: string,
): Promise<
	| {
			ok: false;
	  }
	| {
			ok: true;
			token: string;
			user: Record<string, unknown>;
	  }
> {
	const token = await fetchAccessTokenBySessionFromDatabase(deps.db, session);

	if (token == null || token.session == null || token.fetched) {
		return {
			ok: false,
		};
	}

	await markAccessTokenFetchedInDatabase(deps.db, token.id);

	return {
		ok: true,
		token: token.token,
		user: await packUserDetailedNotMeForApi(deps, await fetchUserByIdOrFailFromDatabase(deps.db, token.userId)),
	};
}
