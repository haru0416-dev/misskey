/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Params } from '../validation.js';
import { z } from 'zod';
import { omitUndefined } from '@/misc/clone.js';
import type { Config } from '@/config.js';
import {
	countUserListFavoritesFromDatabase,
	userListFavoriteExistsInDatabase,
} from '@/core/user/user-list-favorite-store.js';
import {
	listUserListMembershipUserIdsByUserListIdFromDatabase,
	listUserListMembershipUserIdsByUserListIdsFromDatabase,
} from '@/core/user/user-list-membership-store.js';
import {
	deleteUserListByIdFromDatabase,
	fetchPublicUserListByIdFromDatabase,
	fetchUserListByIdAndUserIdFromDatabase,
	fetchUserListByIdOrFailFromDatabase,
	listUserListsByUserIdFromDatabase,
	updateUserListInDatabase,
} from '@/core/user/user-list-store.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/user/user-profile-store.js';
import { fetchUserByIdFromDatabase } from '@/core/user/user-store.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { parseId } from '@/misc/id/parse-id.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiLocalUser } from '@/models/User.js';
import type { MiUserList } from '@/models/UserList.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import { ApiError } from '../error.js';
import { parseApiParams } from '../validation.js';

export type UsersDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
};

export type PackedUserList = {
	id: string;
	createdAt: string;
	name: string;
	userIds: string[];
	isPublic: boolean;
};

export type PackedUserListShow = PackedUserList & {
	likedCount?: number;
	isLiked?: boolean;
};

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

async function packUserList(
	deps: UsersDependencies,
	src: MiUserList['id'] | MiUserList,
	options?: {
		userIds?: string[];
	},
): Promise<PackedUserList> {
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

async function packUserListsMany(deps: UsersDependencies, userLists: MiUserList[]): Promise<PackedUserList[]> {
	const userIdsByListId = await listUserListMembershipUserIdsByUserListIdsFromDatabase(
		deps.db,
		userLists.map((userList) => userList.id),
	);
	return await Promise.all(
		userLists.map((userList) =>
			packUserList(deps, userList, {
				userIds: userIdsByListId.get(userList.id) ?? [],
			}),
		),
	);
}

export async function handleApiUsersListsList(
	deps: UsersDependencies,
	me: MiLocalUser | null,
	params: Params<typeof usersListsListParamDef>,
): Promise<PackedUserList[]> {
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

	return await packUserListsMany(deps, userLists);
}

export async function handleApiUsersListsShow(
	deps: UsersDependencies,
	me: MiLocalUser | null,
	params: Params<typeof usersListsShowParamDef>,
): Promise<PackedUserListShow> {
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

	const packed: PackedUserListShow = await packUserList(deps, userList);
	if (params.forPublic && userList.isPublic) {
		packed.likedCount = await countUserListFavoritesFromDatabase(deps.db, params.listId);
		packed.isLiked = me !== null ? await userListFavoriteExistsInDatabase(deps.db, me.id, params.listId) : false;
	}

	return packed;
}

export async function handleApiUsersListsDelete(
	deps: UsersDependencies,
	me: MiLocalUser,
	params: Params<typeof usersListsDeleteParamDef>,
): Promise<void> {
	const userList = await fetchUserListByIdAndUserIdFromDatabase(deps.db, params.listId, me.id);

	if (userList == null) {
		throw new ApiError({
			status: 400,
			message: 'No such list.',
			code: 'NO_SUCH_LIST',
			id: '78436795-db79-42f5-b1e2-55ea2cf19166',
		});
	}

	await deleteUserListByIdFromDatabase(deps.db, userList.id);
}

export async function handleApiUsersListsUpdate(
	deps: UsersDependencies,
	me: MiLocalUser,
	params: Params<typeof usersListsUpdateParamDef>,
): Promise<PackedUserList> {
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

	return await packUserList(deps, userList.id);
}
