/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { omitUndefined } from '@/misc/clone.js';
import type { Config } from '@/config.js';
import {
	countUserListFavoritesFromDatabase,
	userListFavoriteExistsInDatabase,
} from '@/core/user/UserListFavoriteStore.js';
import {
	listUserListMembershipUserIdsByUserListIdFromDatabase,
	listUserListMembershipUserIdsByUserListIdsFromDatabase,
} from '@/core/user/UserListMembershipStore.js';
import {
	deleteUserListByIdInDatabase,
	fetchPublicUserListByIdFromDatabase,
	fetchUserListByIdAndUserIdFromDatabase,
	fetchUserListByIdOrFailFromDatabase,
	listUserListsByUserIdFromDatabase,
	updateUserListInDatabase,
} from '@/core/user/UserListStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/user/UserProfileStore.js';
import { fetchUserByIdFromDatabase } from '@/core/user/UserStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { parseId } from '@/misc/id/parse-id.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiLocalUser } from '@/models/User.js';
import type { MiUserList } from '@/models/UserList.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import { ApiError } from '../error.js';
import { parseApiParams } from '../validation.js';

export type ApiUsersDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
};

export type ApiPackedUserList = {
	id: string;
	createdAt: string;
	name: string;
	userIds: string[];
	isPublic: boolean;
};

export type ApiPackedUserListShow = ApiPackedUserList & {
	likedCount?: number;
	isLiked?: boolean;
};

export const usersAchievementsParamDef = z.object({
	userId: misskeyId(),
});

export const usersListsDeleteParamDef = z.object({
	listId: misskeyId(),
});

export const usersListsListParamDef = z.object({
	userId: misskeyId().optional(),
});

export const usersListsShowParamDef = z.object({
	listId: misskeyId(),
	forPublic: z.boolean().optional().default(false),
});

export const usersListsUpdateParamDef = z.object({
	listId: misskeyId(),
	name: z.string().min(1).max(100).optional(),
	isPublic: z.boolean().optional(),
});

async function packUserListForApi(
	deps: ApiUsersDependencies,
	src: MiUserList['id'] | MiUserList,
	options?: {
		userIds?: string[];
	},
): Promise<ApiPackedUserList> {
	const userList = typeof src === 'object' ? src : await fetchUserListByIdOrFailFromDatabase(deps.db, src);
	const userIds =
		options?.userIds ?? (await listUserListMembershipUserIdsByUserListIdFromDatabase(deps.db, userList.id));

	return {
		id: userList.id,
		createdAt: parseId(userList.id).date.toISOString(),
		name: userList.name,
		userIds,
		isPublic: userList.isPublic,
	};
}

async function packUserListsManyForApi(
	deps: ApiUsersDependencies,
	userLists: MiUserList[],
): Promise<ApiPackedUserList[]> {
	const userIdsByListId = await listUserListMembershipUserIdsByUserListIdsFromDatabase(
		deps.db,
		userLists.map((userList) => userList.id),
	);
	return await Promise.all(
		userLists.map((userList) =>
			packUserListForApi(deps, userList, {
				userIds: userIdsByListId.get(userList.id) ?? [],
			}),
		),
	);
}

export async function handleApiUsersAchievements(
	deps: ApiUsersDependencies,
	body: Record<string, unknown>,
): Promise<MiUserProfile['achievements']> {
	const params = parseApiParams(usersAchievementsParamDef, body);
	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, params.userId);
	return profile.achievements;
}

export async function handleApiUsersListsList(
	deps: ApiUsersDependencies,
	me: MiLocalUser | null,
	body: Record<string, unknown>,
): Promise<ApiPackedUserList[]> {
	const params = parseApiParams(usersListsListParamDef, body);

	if (params.userId !== undefined) {
		const user = await fetchUserByIdFromDatabase(deps.db, params.userId);
		if (user == null) {
			throw new ApiError({
				status: 400,
				message: 'No such user.',
				code: 'NO_SUCH_USER',
				id: 'a8af4a82-0980-4cc4-a6af-8b0ffd54465e',
			});
		}
		if (user.host !== null) {
			throw new ApiError({
				status: 400,
				message: "Not allowed to load the remote user's list",
				code: 'REMOTE_USER_NOT_ALLOWED',
				id: '53858f1b-3315-4a01-81b7-db9b48d4b79a',
			});
		}
	} else if (me === null) {
		throw new ApiError({
			status: 400,
			message: 'Invalid param.',
			code: 'INVALID_PARAM',
			id: 'ab36de0e-29e9-48cb-9732-d82f1281620d',
		});
	}

	const userLists =
		params.userId === undefined
			? await listUserListsByUserIdFromDatabase(deps.db, me!.id)
			: await listUserListsByUserIdFromDatabase(deps.db, params.userId, { publicOnly: true });

	return await packUserListsManyForApi(deps, userLists);
}

export async function handleApiUsersListsShow(
	deps: ApiUsersDependencies,
	me: MiLocalUser | null,
	body: Record<string, unknown>,
): Promise<ApiPackedUserListShow> {
	const params = parseApiParams(usersListsShowParamDef, body);
	const userList =
		!params.forPublic && me !== null
			? await fetchUserListByIdAndUserIdFromDatabase(deps.db, params.listId, me.id)
			: await fetchPublicUserListByIdFromDatabase(deps.db, params.listId);

	if (userList == null) {
		throw new ApiError({
			status: 400,
			message: 'No such list.',
			code: 'NO_SUCH_LIST',
			id: '7bc05c21-1d7a-41ae-88f1-66820f4dc686',
		});
	}

	const packed: ApiPackedUserListShow = await packUserListForApi(deps, userList);
	if (params.forPublic && userList.isPublic) {
		packed.likedCount = await countUserListFavoritesFromDatabase(deps.db, params.listId);
		packed.isLiked = me !== null ? await userListFavoriteExistsInDatabase(deps.db, me.id, params.listId) : false;
	}

	return packed;
}

export async function handleApiUsersListsDelete(
	deps: ApiUsersDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(usersListsDeleteParamDef, body);
	const userList = await fetchUserListByIdAndUserIdFromDatabase(deps.db, params.listId, me.id);

	if (userList == null) {
		throw new ApiError({
			status: 400,
			message: 'No such list.',
			code: 'NO_SUCH_LIST',
			id: '78436795-db79-42f5-b1e2-55ea2cf19166',
		});
	}

	await deleteUserListByIdInDatabase(deps.db, userList.id);
}

export async function handleApiUsersListsUpdate(
	deps: ApiUsersDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<ApiPackedUserList> {
	const params = parseApiParams(usersListsUpdateParamDef, body);
	const userList = await fetchUserListByIdAndUserIdFromDatabase(deps.db, params.listId, me.id);

	if (userList == null) {
		throw new ApiError({
			status: 400,
			message: 'No such list.',
			code: 'NO_SUCH_LIST',
			id: '796666fe-3dff-4d39-becb-8a5932c1d5b7',
		});
	}

	await updateUserListInDatabase(
		deps.db,
		userList.id,
		omitUndefined({
			name: params.name,
			isPublic: params.isPublic,
		}),
	);

	return await packUserListForApi(deps, userList.id);
}
