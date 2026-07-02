/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createAccessTokenInDatabase } from '@/core/AccessTokenStore.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import type { MiLocalUser } from '@/models/User.js';
import { createTokenNotification, type HonoApiNotificationDependencies } from './hono-api-notification.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiMiauthDependencies = HonoApiNotificationDependencies & {
	config: Config;
	db: MiDrizzleDatabase;
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
	const params = parseHonoApiParams(miauthGenTokenParamDef, body) as MiauthGenTokenBody;
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
