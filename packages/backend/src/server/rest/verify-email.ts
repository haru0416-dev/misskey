/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import { fetchUserProfileByEmailVerifyCodeFromDatabase, updateUserProfileInDatabase } from '@/core/UserProfileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { HonoApiError } from './error.js';
import type { HonoApiMainStreamPublisher } from './notification.js';
import { packMeDetailedForHonoApi, type UserPackingDependencies } from './user.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiVerifyEmailDependencies = UserPackingDependencies & {
	db: MiDrizzleDatabase;
	publishMainStream?: HonoApiMainStreamPublisher;
};

const verifyEmailParamDef = {
	type: 'object',
	properties: {
		code: { type: 'string' },
	},
	required: ['code'],
} as const;

type VerifyEmailParams = {
	code: string;
};

function noSuchCodeError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such code.',
		code: 'NO_SUCH_CODE',
		id: '97c1f576-e4b8-4b8a-a6dc-9cb65e7f6f85',
	});
}

export async function handleHonoApiVerifyEmail(
	deps: HonoApiVerifyEmailDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(verifyEmailParamDef, body) as VerifyEmailParams;
	const profile = await fetchUserProfileByEmailVerifyCodeFromDatabase(deps.db, params.code);

	if (profile == null) {
		throw noSuchCodeError();
	}

	await updateUserProfileInDatabase(deps.db, profile.userId, {
		emailVerified: true,
		emailVerifyCode: null,
	});

	const user = await fetchUserByIdOrFailFromDatabase(deps.db, profile.userId);
	deps.publishMainStream?.(profile.userId, 'meUpdated', await packMeDetailedForHonoApi(deps, user, {
		includeSecrets: true,
		profile: {
			...profile,
			emailVerified: true,
			emailVerifyCode: null,
		},
	}));
}
