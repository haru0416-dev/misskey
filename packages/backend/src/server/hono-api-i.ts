/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import { fetchUserProfileByUserIdFromDatabase, updateUserProfileInDatabase } from '@/core/UserProfileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type { MiLocalUser } from '@/models/User.js';
import { userDeletedError } from './hono-api-error.js';
import { packMeDetailedForHonoApi, type UserPackingDependencies } from './hono-api-user.js';

export type HonoApiIDependencies = UserPackingDependencies & {
	db: MiDrizzleDatabase;
};

export async function handleHonoApiI(
	deps: HonoApiIDependencies,
	user: MiLocalUser,
	token: MiAccessToken | null,
): Promise<Record<string, unknown>> {
	const now = new Date();
	const today = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;

	const [userProfile, freshUser] = await Promise.all([
		fetchUserProfileByUserIdFromDatabase(deps.db, user.id),
		fetchUserByIdOrFailFromDatabase(deps.db, user.id),
	]);

	if (userProfile == null) {
		throw userDeletedError();
	}

	if (!userProfile.loggedInDates.includes(today)) {
		userProfile.loggedInDates = [...userProfile.loggedInDates, today];
		await updateUserProfileInDatabase(deps.db, user.id, {
			loggedInDates: userProfile.loggedInDates,
		});
	}

	return await packMeDetailedForHonoApi(deps, freshUser, {
		includeSecrets: token == null,
		profile: userProfile,
	});
}
