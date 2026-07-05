/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createAccessTokenInDatabase, fetchAccessTokenBySessionFromDatabase, markAccessTokenFetchedInDatabase } from '@/core/AccessTokenStore.js';
import type { Config } from '@/config.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import { createTokenNotification, type HonoApiNotificationDependencies } from './notification.js';
import { packUserDetailedNotMeForHonoApi } from './user.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiMiauthDependencies = HonoApiNotificationDependencies & {
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

const miauthGenTokenParamDef = {
	type: 'object',
	properties: {
		session: { type: 'string', nullable: true },
		name: { type: 'string', nullable: true },
		description: { type: 'string', nullable: true },
		iconUrl: { type: 'string', nullable: true },
		permission: {
			type: 'array',
			uniqueItems: true,
			items: {
				type: 'string',
			},
		},
	},
	required: ['session', 'permission'],
} as const;

export async function handleHonoApiMiauthGenToken(
	deps: HonoApiMiauthDependencies,
	user: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ token: string }> {
	const params = parseHonoApiParams(miauthGenTokenParamDef, body);
	const accessToken = secureRndstr(32);
	const now = new Date();

	await createAccessTokenInDatabase(deps.db, {
		id: genId(deps.config, now.getTime()),
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

export async function handleHonoApiMiauthCheck(
	deps: HonoApiMiauthDependencies,
	session: string,
): Promise<{
	ok: false;
} | {
	ok: true;
	token: string;
	user: Record<string, unknown>;
}> {
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
		user: await packUserDetailedNotMeForHonoApi(deps, await fetchUserByIdOrFailFromDatabase(deps.db, token.userId)),
	};
}
