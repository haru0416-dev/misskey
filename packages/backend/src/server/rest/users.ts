/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import { countUserListFavoritesFromDatabase, userListFavoriteExistsInDatabase } from '@/core/UserListFavoriteStore.js';
import { listUserListMembershipUserIdsByUserListIdFromDatabase } from '@/core/UserListMembershipStore.js';
import { deleteUserListByIdInDatabase, fetchPublicUserListByIdFromDatabase, fetchUserListByIdAndUserIdFromDatabase, fetchUserListByIdOrFailFromDatabase, listUserListsByUserIdFromDatabase, updateUserListInDatabase } from '@/core/UserListStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/UserProfileStore.js';
import { fetchUserByIdFromDatabase } from '@/core/UserStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { MiLocalUser } from '@/models/User.js';
import type { MiUserList } from '@/models/UserList.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import { HonoApiError } from './error.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiUsersDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
};

export type HonoApiPackedUserList = {
	id: string;
	createdAt: string;
	name: string;
	userIds: string[];
	isPublic: boolean;
};

export type HonoApiPackedUserListShow = HonoApiPackedUserList & {
	likedCount?: number;
	isLiked?: boolean;
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

const usersListsListParamDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: [],
} as const;

const usersListsShowParamDef = {
	type: 'object',
	properties: {
		listId: { type: 'string', format: 'misskey:id' },
		forPublic: { type: 'boolean', default: false },
	},
	required: ['listId'],
} as const;

const usersListsUpdateParamDef = {
	type: 'object',
	properties: {
		listId: { type: 'string', format: 'misskey:id' },
		name: { type: 'string', minLength: 1, maxLength: 100 },
		isPublic: { type: 'boolean' },
	},
	required: ['listId'],
} as const;

type UsersAchievementsParams = {
	userId: string;
};

type UsersListsDeleteParams = {
	listId: string;
};

type UsersListsListParams = {
	userId?: string;
};

type UsersListsShowParams = {
	listId: string;
	forPublic: boolean;
};

type UsersListsUpdateParams = {
	listId: string;
	name?: string;
	isPublic?: boolean;
};

async function packUserListForHonoApi(
	deps: HonoApiUsersDependencies,
	src: MiUserList['id'] | MiUserList,
): Promise<HonoApiPackedUserList> {
	const userList = typeof src === 'object' ? src : await fetchUserListByIdOrFailFromDatabase(deps.db, src);
	const userIds = await listUserListMembershipUserIdsByUserListIdFromDatabase(deps.db, userList.id);

	return {
		id: userList.id,
		createdAt: parseId(deps.config, userList.id).date.toISOString(),
		name: userList.name,
		userIds,
		isPublic: userList.isPublic,
	};
}

export async function handleHonoApiUsersAchievements(
	deps: HonoApiUsersDependencies,
	body: Record<string, unknown>,
): Promise<MiUserProfile['achievements']> {
	const params = parseHonoApiParams(usersAchievementsParamDef, body);
	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, params.userId);
	return profile.achievements;
}

export async function handleHonoApiUsersListsList(
	deps: HonoApiUsersDependencies,
	me: MiLocalUser | null,
	body: Record<string, unknown>,
): Promise<HonoApiPackedUserList[]> {
	const params = parseHonoApiParams(usersListsListParamDef, body);

	if (params.userId !== undefined) {
		const user = await fetchUserByIdFromDatabase(deps.db, params.userId);
		if (user == null) {
			throw new HonoApiError({
				status: 400,
				message: 'No such user.',
				code: 'NO_SUCH_USER',
				id: 'a8af4a82-0980-4cc4-a6af-8b0ffd54465e',
			});
		}
		if (user.host !== null) {
			throw new HonoApiError({
				status: 400,
				message: 'Not allowed to load the remote user\'s list',
				code: 'REMOTE_USER_NOT_ALLOWED',
				id: '53858f1b-3315-4a01-81b7-db9b48d4b79a',
			});
		}
	} else if (me === null) {
		throw new HonoApiError({
			status: 400,
			message: 'Invalid param.',
			code: 'INVALID_PARAM',
			id: 'ab36de0e-29e9-48cb-9732-d82f1281620d',
		});
	}

	const userLists = params.userId === undefined
		? await listUserListsByUserIdFromDatabase(deps.db, me!.id)
		: await listUserListsByUserIdFromDatabase(deps.db, params.userId, { publicOnly: true });

	return await Promise.all(userLists.map(userList => packUserListForHonoApi(deps, userList)));
}

export async function handleHonoApiUsersListsShow(
	deps: HonoApiUsersDependencies,
	me: MiLocalUser | null,
	body: Record<string, unknown>,
): Promise<HonoApiPackedUserListShow> {
	const params = parseHonoApiParams(usersListsShowParamDef, body);
	const userList = !params.forPublic && me !== null
		? await fetchUserListByIdAndUserIdFromDatabase(deps.db, params.listId, me.id)
		: await fetchPublicUserListByIdFromDatabase(deps.db, params.listId);

	if (userList == null) {
		throw new HonoApiError({
			status: 400,
			message: 'No such list.',
			code: 'NO_SUCH_LIST',
			id: '7bc05c21-1d7a-41ae-88f1-66820f4dc686',
		});
	}

	const packed: HonoApiPackedUserListShow = await packUserListForHonoApi(deps, userList);
	if (params.forPublic && userList.isPublic) {
		packed.likedCount = await countUserListFavoritesFromDatabase(deps.db, params.listId);
		packed.isLiked = me !== null
			? await userListFavoriteExistsInDatabase(deps.db, me.id, params.listId)
			: false;
	}

	return packed;
}

export async function handleHonoApiUsersListsDelete(
	deps: HonoApiUsersDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(usersListsDeleteParamDef, body);
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

export async function handleHonoApiUsersListsUpdate(
	deps: HonoApiUsersDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<HonoApiPackedUserList> {
	const params = parseHonoApiParams(usersListsUpdateParamDef, body);
	const userList = await fetchUserListByIdAndUserIdFromDatabase(deps.db, params.listId, me.id);

	if (userList == null) {
		throw new HonoApiError({
			status: 400,
			message: 'No such list.',
			code: 'NO_SUCH_LIST',
			id: '796666fe-3dff-4d39-becb-8a5932c1d5b7',
		});
	}

	await updateUserListInDatabase(deps.db, userList.id, {
		name: params.name,
		isPublic: params.isPublic,
	});

	return await packUserListForHonoApi(deps, userList.id);
}
