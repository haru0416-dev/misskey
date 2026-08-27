/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { fetchUserByIdOrFailFromDatabase } from '@/core/user/UserStore.js';
import {
	fetchUserProfileByEmailVerifyCodeFromDatabase,
	updateUserProfileInDatabase,
} from '@/core/user/UserProfileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { ApiError } from '../error.js';
import type { ApiMainStreamPublisher } from '../notification/notification.js';
import { packMeDetailedForApi, type UserPackingDependencies } from '../user/user.js';
import { parseApiParams } from '../validation.js';

export type ApiVerifyEmailDependencies = UserPackingDependencies & {
	db: MiDrizzleDatabase;
	publishMainStream?: ApiMainStreamPublisher;
};

export const verifyEmailParamDef = z.object({
	code: z.string(),
});

function noSuchCodeError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such code.',
		code: 'NO_SUCH_CODE',
		id: '97c1f576-e4b8-4b8a-a6dc-9cb65e7f6f85',
	});
}

export async function handleApiVerifyEmail(
	deps: ApiVerifyEmailDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(verifyEmailParamDef, body);
	const profile = await fetchUserProfileByEmailVerifyCodeFromDatabase(deps.db, params.code);

	if (profile == null) {
		throw noSuchCodeError();
	}

	await updateUserProfileInDatabase(deps.db, profile.userId, {
		emailVerified: true,
		emailVerifyCode: null,
	});

	const user = await fetchUserByIdOrFailFromDatabase(deps.db, profile.userId);
	deps.publishMainStream?.(
		profile.userId,
		'meUpdated',
		await packMeDetailedForApi(deps, user, {
			includeSecrets: true,
			profile: {
				...profile,
				emailVerified: true,
				emailVerifyCode: null,
			},
		}),
	);
}
