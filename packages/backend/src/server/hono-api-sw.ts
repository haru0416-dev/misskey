/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fetchSwSubscriptionFromDatabase } from '@/core/SwSubscriptionStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiLocalUser } from '@/models/User.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiSwDependencies = {
	db: MiDrizzleDatabase;
};

const swShowRegistrationParamDef = {
	type: 'object',
	properties: {
		endpoint: { type: 'string' },
	},
	required: ['endpoint'],
} as const;

type SwShowRegistrationParams = {
	endpoint: string;
};

type SwShowRegistrationResponse = {
	userId: string;
	endpoint: string;
	sendReadMessage: boolean;
};

export async function handleHonoApiSwShowRegistration(
	deps: HonoApiSwDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<SwShowRegistrationResponse | null> {
	const params = parseHonoApiParams(swShowRegistrationParamDef, body) as SwShowRegistrationParams;
	const exist = await fetchSwSubscriptionFromDatabase(deps.db, me.id, params.endpoint);

	if (exist == null) {
		return null;
	}

	return {
		userId: exist.userId,
		endpoint: exist.endpoint,
		sendReadMessage: exist.sendReadMessage,
	};
}
