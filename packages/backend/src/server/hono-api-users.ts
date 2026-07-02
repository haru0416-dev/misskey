/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { deleteUserListByIdInDatabase, fetchUserListByIdAndUserIdFromDatabase } from '@/core/UserListStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/UserProfileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiLocalUser } from '@/models/User.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import { HonoApiError } from './hono-api-error.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiUsersDependencies = {
	db: MiDrizzleDatabase;
};

const usersAchievementsParamDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId'],
} as const;

const usersListsDeleteParamDef = {
	type: 'object',
	properties: {
		listId: { type: 'string', format: 'misskey:id' },
	},
	required: ['listId'],
} as const;

type UsersAchievementsParams = {
	userId: string;
};

type UsersListsDeleteParams = {
	listId: string;
};

export async function handleHonoApiUsersAchievements(
	deps: HonoApiUsersDependencies,
	body: Record<string, unknown>,
): Promise<MiUserProfile['achievements']> {
	const params = parseHonoApiParams(usersAchievementsParamDef, body) as UsersAchievementsParams;
	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, params.userId);
	return profile.achievements;
}

export async function handleHonoApiUsersListsDelete(
	deps: HonoApiUsersDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(usersListsDeleteParamDef, body) as UsersListsDeleteParams;
	const userList = await fetchUserListByIdAndUserIdFromDatabase(deps.db, params.listId, me.id);

	if (userList == null) {
		throw new HonoApiError({
			status: 400,
			message: 'No such list.',
			code: 'NO_SUCH_LIST',
			id: '78436795-db79-42f5-b1e2-55ea2cf19166',
		});
	}

	await deleteUserListByIdInDatabase(deps.db, userList.id);
}
