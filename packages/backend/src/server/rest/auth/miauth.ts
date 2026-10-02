/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Params } from '../validation.js';
import { z } from 'zod';
import {
	createAccessTokenInDatabase,
	fetchAccessTokenBySessionFromDatabase,
	markAccessTokenFetchedInDatabase,
} from '@/core/app/access-token-store.js';
import type { Config } from '@/config.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/user/user-store.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import { uniqueItems } from '@/misc/zod-params.js';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import { createTokenNotification } from '../../../core/notification/notification.js';
import type { NotificationDependencies } from '../../../core/notification/notification.js';
import { packUserDetailedNotMe } from '../user/user.js';
import { parseApiParams } from '../validation.js';

export type MiauthDependencies = NotificationDependencies & {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
};

export const miauthGenTokenParamDef = z.object({
	session: z.string().nullable(),
	name: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	iconUrl: z.string().nullable().optional(),
	permission: uniqueItems(z.array(z.string())),
});

export async function handleApiMiauthGenToken(
	deps: MiauthDependencies,
	user: MiLocalUser,
	params: Params<typeof miauthGenTokenParamDef>,
): Promise<{ token: string }> {
	const accessToken = secureRndstr(32);
	const now = new Date();

	await createAccessTokenInDatabase(deps.db, {
		id: genId(now.getTime()),
		lastUsedAt: now,
		session: params.session,
		userId: user.id,
		token: accessToken,
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
	deps: MiauthDependencies,
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
		user: await packUserDetailedNotMe(deps, await fetchUserByIdOrFailFromDatabase(deps.db, token.userId)),
	};
}
