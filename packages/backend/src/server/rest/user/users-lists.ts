/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { omitUndefined } from '@/misc/clone.js';
import {
	blockingExistsInDatabase,
	listBlockerIdsByBlockeeIdAndBlockerIdsFromDatabase,
} from '@/core/user/BlockingStore.js';
import type { RelationshipQueue } from '@/core/queue/queues.js';
import { queueRetentionOptions } from '@/queue/const.js';
import { fetchOrCreateSystemAccountInDatabase } from '@/core/system-account/SystemAccountLogic.js';
import {
	createUserListMembershipWithinLimitInDatabase,
	deleteUserListMembershipInDatabase,
	fetchUserListMembershipByUserIdAndUserListIdFromDatabase,
	listUserListMembershipsByUserListIdWithPaginationFromDatabase,
	listUserListMembershipUserIdsByUserListIdFromDatabase,
	resolveUserListMembershipPagination,
	updateUserListMembershipWithRepliesInDatabase,
	userListMembershipExistsInDatabase,
} from '@/core/user/UserListMembershipStore.js';
import {
	createUserListWithinLimitInDatabase,
	createUserListWithMembershipsWithinLimitsInDatabase,
	countUserListsByUserIdFromDatabase,
	fetchPublicUserListByIdForShareFromDatabase,
	fetchPublicUserListByIdFromDatabase,
	fetchUserListByIdAndUserIdFromDatabase,
	lockUserListOwnerForCreationInDatabase,
} from '@/core/user/UserListStore.js';
import { fetchUserByIdFromDatabase, listUsersByIdsForKeyShareFromDatabase } from '@/core/user/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import type { UserListMembershipRow } from '@/db/schema/user-list-membership.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { MiUserList } from '@/models/UserList.js';
import { ApiError } from '../error.js';
import type { ApiInternalEventPublisher, ApiUserListStreamPublisher } from '../events.js';
import { packUserLiteForApi, packUserLiteManyForApi, type UserPackingDependencies } from './user.js';
import { getApiRolePolicies, type ApiRolePolicyDependencies } from '../role/role-policy.js';
import { parseApiParams } from '../validation.js';

export type ApiUsersListsDependencies = UserPackingDependencies &
	ApiRolePolicyDependencies & {
		relationshipQueue: RelationshipQueue;
		publishInternalEvent?: ApiInternalEventPublisher;
		publishUserListStream?: ApiUserListStreamPublisher;
	};

class TooManyUsersError extends Error {}

async function packUserListByRowForApi(
	deps: ApiUsersListsDependencies,
	userList: MiUserList,
): Promise<{ id: string; createdAt: string; name: string; userIds: string[]; isPublic: boolean }> {
	const userIds = await listUserListMembershipUserIdsByUserListIdFromDatabase(deps.db, userList.id);

	return {
		id: userList.id,
		createdAt: parseId(userList.id).date.toISOString(),
		name: userList.name,
		userIds,
		isPublic: userList.isPublic,
	};
}

async function packUserListMembershipsManyForApi(
	deps: ApiUsersListsDependencies,
	memberships: UserListMembershipRow[],
): Promise<{ id: string; createdAt: string; userId: string; user: Packed<'UserLite'>; withReplies: boolean }[]> {
	const packedUsers = await packUserLiteManyForApi(
		deps,
		memberships.map(({ userId }) => userId),
	);
	const userMap = new Map(packedUsers.map((u) => [u.id, u]));

	return await Promise.all(
		memberships.map(async (membership) => ({
			id: membership.id,
			createdAt: parseId(membership.id).date.toISOString(),
			userId: membership.userId,
			user: userMap.get(membership.userId) ?? (await packUserLiteForApi(deps, membership.userId)),
			withReplies: membership.withReplies,
		})),
	);
}

function createFollowJobForApi(
	deps: ApiUsersListsDependencies,
	followings: { from: { id: MiUser['id'] }; to: { id: MiUser['id'] } }[],
): Promise<unknown> {
	const jobs = followings.map((rel) => ({
		name: 'follow',
		data: {
			from: { id: rel.from.id },
			to: { id: rel.to.id },
		},
		opts: queueRetentionOptions(deps.config),
	}));
	return deps.relationshipQueue.addBulk(jobs);
}

export async function addUserListMemberForApi(
	deps: ApiUsersListsDependencies,
	target: MiUser,
	list: MiUserList,
	me: MiUser,
	options: { withReplies?: boolean } = {},
): Promise<void> {
	const policies = await getApiRolePolicies(deps, me);
	const created = await createUserListMembershipWithinLimitInDatabase(
		deps.db,
		{
			id: genId(),
			userId: target.id,
			userListId: list.id,
			userListUserId: list.userId,
			withReplies: options.withReplies ?? false,
		},
		policies.userEachUserListsLimit,
	);
	if (!created) throw new TooManyUsersError();

	deps.publishInternalEvent?.('userListMemberAdded', { userListId: list.id, memberId: target.id });
	deps.publishUserListStream?.(list.id, 'userAdded', await packUserLiteForApi(deps, target));

	if (target.host != null) {
		const proxy = await fetchOrCreateSystemAccountInDatabase({ db: deps.db, meta: deps.meta, genId }, 'proxy');
		await createFollowJobForApi(deps, [{ from: { id: proxy.id }, to: { id: target.id } }]);
	}
}

async function removeUserListMemberForApi(
	deps: ApiUsersListsDependencies,
	target: MiUser,
	list: MiUserList,
): Promise<void> {
	await deleteUserListMembershipInDatabase(deps.db, target.id, list.id);

	deps.publishInternalEvent?.('userListMemberRemoved', { userListId: list.id, memberId: target.id });
	deps.publishUserListStream?.(list.id, 'userRemoved', await packUserLiteForApi(deps, target));
}

async function updateUserListMembershipForApi(
	deps: ApiUsersListsDependencies,
	target: MiUser,
	list: MiUserList,
	options: { withReplies?: boolean },
): Promise<void> {
	const membership = await fetchUserListMembershipByUserIdAndUserListIdFromDatabase(deps.db, target.id, list.id);
	if (membership == null) {
		throw new Error('User is not a member of the list');
	}

	await updateUserListMembershipWithRepliesInDatabase(deps.db, membership.id, options.withReplies);
}

function noSuchListError(id: string): ApiError {
	return new ApiError({ status: 400, message: 'No such list.', code: 'NO_SUCH_LIST', id });
}

function noSuchUserError(id: string): ApiError {
	return new ApiError({ status: 400, message: 'No such user.', code: 'NO_SUCH_USER', id });
}

async function getUserForApi(
	deps: ApiUsersListsDependencies,
	userId: string,
	noSuchUserErrorId: string,
): Promise<MiUser> {
	const user = await fetchUserByIdFromDatabase(deps.db, userId);
	if (user == null) throw noSuchUserError(noSuchUserErrorId);
	return user;
}

export const createParamDef = z.object({
	name: z.string().min(1).max(100),
});

type CreateParams = {
	name: string;
};

export async function handleApiUsersListsCreate(
	deps: ApiUsersListsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ id: string; createdAt: string; name: string; userIds: string[]; isPublic: boolean }> {
	const params = parseApiParams(createParamDef, body);

	const policies = await getApiRolePolicies(deps, me);
	const userList = await createUserListWithinLimitInDatabase(
		deps.db,
		{
			id: genId(),
			userId: me.id,
			name: params.name,
		},
		policies.userListLimit,
	);
	if (!userList)
		throw new ApiError({
			status: 400,
			message: 'You cannot create user list any more.',
			code: 'TOO_MANY_USERLISTS',
			id: '0cf21a28-7715-4f39-a20d-777bfdb8d138',
		});

	return await packUserListByRowForApi(deps, userList);
}

export const createFromPublicParamDef = z.object({
	name: z.string().min(1).max(100),
	listId: misskeyId(),
});

type CreateFromPublicParams = {
	name: string;
	listId: string;
};

export async function handleApiUsersListsCreateFromPublic(
	deps: ApiUsersListsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ id: string; createdAt: string; name: string; userIds: string[]; isPublic: boolean }> {
	const params = parseApiParams(createFromPublicParamDef, body);
	const copied = await deps.db.transaction(async (transaction) => {
		const db = transaction as typeof deps.db;
		const ownerExists = await lockUserListOwnerForCreationInDatabase(db, me.id);
		const sourceList = await fetchPublicUserListByIdForShareFromDatabase(db, params.listId);
		if (sourceList == null) throw noSuchListError('9292f798-6175-4f7d-93f4-b6742279667d');

		const policies = await getApiRolePolicies({ ...deps, db }, me);
		if (!ownerExists || (await countUserListsByUserIdFromDatabase(db, me.id)) >= policies.userListLimit) {
			throw new ApiError({
				status: 400,
				message: 'You cannot create user list any more.',
				code: 'TOO_MANY_USERLISTS',
				id: 'e9c105b2-c595-47de-97fb-7f7c2c33e92f',
			});
		}

		const userIds = await listUserListMembershipUserIdsByUserListIdFromDatabase(db, sourceList.id);
		if (userIds.length > policies.userEachUserListsLimit) {
			throw new ApiError({
				status: 400,
				message: 'You can not push users any more.',
				code: 'TOO_MANY_USERS',
				id: '1845ea77-38d1-426e-8e4e-8b83b24f5bd7',
			});
		}

		const userIdBatches = Array.from({ length: Math.ceil(userIds.length / 10_000) }, (_, index) =>
			userIds.slice(index * 10_000, (index + 1) * 10_000),
		);
		const [fetchedUserBatches, blockerIds] = await Promise.all([
			Promise.all(userIdBatches.map((ids) => listUsersByIdsForKeyShareFromDatabase(db, ids))),
			listBlockerIdsByBlockeeIdAndBlockerIdsFromDatabase(
				db,
				me.id,
				userIds.filter((userId) => userId !== me.id),
			),
		]);
		const userById = new Map(fetchedUserBatches.flat().map((user) => [user.id, user]));
		const users = userIds.map((userId) => {
			const user = userById.get(userId);
			if (user == null) throw noSuchUserError('13c457db-a8cb-4d88-b70a-211ceeeabb5f');
			return user;
		});
		if (blockerIds.length > 0) {
			throw new ApiError({
				status: 400,
				message: 'You cannot push this user because you have been blocked by this user.',
				code: 'YOU_HAVE_BEEN_BLOCKED',
				id: 'a2497f2a-2389-439c-8626-5298540530f4',
			});
		}

		const packedUsers =
			deps.publishUserListStream == null
				? []
				: (
						await Promise.all(
							Array.from({ length: Math.ceil(userIds.length / 50) }, (_, index) =>
								packUserLiteManyForApi({ ...deps, db }, userIds.slice(index * 50, (index + 1) * 50)),
							),
						)
					).flat();
		const result = await createUserListWithMembershipsWithinLimitsInDatabase(
			db,
			{
				id: genId(),
				userId: me.id,
				name: params.name,
			},
			users.map((user) => ({ id: genId(), userId: user.id })),
			{
				lists: policies.userListLimit,
				members: policies.userEachUserListsLimit,
			},
		);
		if (result.status === 'tooManyLists')
			throw new ApiError({
				status: 400,
				message: 'You cannot create user list any more.',
				code: 'TOO_MANY_USERLISTS',
				id: 'e9c105b2-c595-47de-97fb-7f7c2c33e92f',
			});
		if (result.status === 'tooManyMembers')
			throw new ApiError({
				status: 400,
				message: 'You can not push users any more.',
				code: 'TOO_MANY_USERS',
				id: '1845ea77-38d1-426e-8e4e-8b83b24f5bd7',
			});
		return { userList: result.userList, userIds, users, packedUsers };
	});
	const { userList, userIds, users, packedUsers } = copied;
	const remoteUsers = users.filter((user) => user.host != null);

	const packedUserById = new Map(packedUsers.map((user) => [user.id, user]));
	for (const user of users) {
		deps.publishInternalEvent?.('userListMemberAdded', { userListId: userList.id, memberId: user.id });
		const packedUser = packedUserById.get(user.id);
		if (packedUser != null) deps.publishUserListStream?.(userList.id, 'userAdded', packedUser);
	}
	if (remoteUsers.length > 0) {
		const proxy = await fetchOrCreateSystemAccountInDatabase({ db: deps.db, meta: deps.meta, genId }, 'proxy');
		await createFollowJobForApi(
			deps,
			remoteUsers.map((user) => ({ from: { id: proxy.id }, to: { id: user.id } })),
		);
	}

	return {
		id: userList.id,
		createdAt: parseId(userList.id).date.toISOString(),
		name: userList.name,
		userIds,
		isPublic: userList.isPublic,
	};
}

export const pullParamDef = z.object({
	listId: misskeyId(),
	userId: misskeyId(),
});

type PullParams = {
	listId: string;
	userId: string;
};

export async function handleApiUsersListsPull(
	deps: ApiUsersListsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(pullParamDef, body);

	const userList = await fetchUserListByIdAndUserIdFromDatabase(deps.db, params.listId, me.id);
	if (userList == null) throw noSuchListError('7f44670e-ab16-43b8-b4c1-ccd2ee89cc02');

	const user = await getUserForApi(deps, params.userId, '588e7f72-c744-4a61-b180-d354e912bda2');

	await removeUserListMemberForApi(deps, user, userList);
}

export const pushParamDef = z.object({
	listId: misskeyId(),
	userId: misskeyId(),
});

type PushParams = {
	listId: string;
	userId: string;
};

export async function handleApiUsersListsPush(
	deps: ApiUsersListsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(pushParamDef, body);

	const userList = await fetchUserListByIdAndUserIdFromDatabase(deps.db, params.listId, me.id);
	if (userList == null) throw noSuchListError('2214501d-ac96-4049-b717-91e42272a711');

	const user = await getUserForApi(deps, params.userId, 'a89abd3d-f0bc-4cce-beb1-2f446f4f1e6a');

	if (user.id !== me.id) {
		const blockExist = await blockingExistsInDatabase(deps.db, user.id, me.id);
		if (blockExist) {
			throw new ApiError({
				status: 400,
				message: 'You cannot push this user because you have been blocked by this user.',
				code: 'YOU_HAVE_BEEN_BLOCKED',
				id: '990232c5-3f9d-4d83-9f3f-ef27b6332a4b',
			});
		}
	}

	const exists = await userListMembershipExistsInDatabase(deps.db, user.id, userList.id);
	if (exists) {
		throw new ApiError({
			status: 400,
			message: 'That user has already been added to that list.',
			code: 'ALREADY_ADDED',
			id: '1de7c884-1595-49e9-857e-61f12f4d4fc5',
		});
	}

	try {
		await addUserListMemberForApi(deps, user, userList, me);
	} catch (err) {
		if (err instanceof TooManyUsersError) {
			throw new ApiError({
				status: 400,
				message: 'You can not push users any more.',
				code: 'TOO_MANY_USERS',
				id: '2dd9752e-a338-413d-8eec-41814430989b',
			});
		}
		throw err;
	}
}

export const getMembershipsParamDef = z.object({
	listId: misskeyId(),
	forPublic: z.boolean().default(false),
	limit: z.int().min(1).max(100).default(30),
	...paginationParams,
});

type GetMembershipsParams = {
	listId: string;
	forPublic: boolean;
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
};

export async function handleApiUsersListsGetMemberships(
	deps: ApiUsersListsDependencies,
	me: MiLocalUser | null,
	body: Record<string, unknown>,
): Promise<{ id: string; createdAt: string; userId: string; user: Packed<'UserLite'>; withReplies: boolean }[]> {
	const params = parseApiParams(getMembershipsParamDef, body);

	const userList =
		!params.forPublic && me != null
			? await fetchUserListByIdAndUserIdFromDatabase(deps.db, params.listId, me.id)
			: await fetchPublicUserListByIdFromDatabase(deps.db, params.listId);

	if (userList == null) throw noSuchListError('7bc05c21-1d7a-41ae-88f1-66820f4dc686');

	const pagination = resolveUserListMembershipPagination({ gen: (time) => genId(time) }, params);
	const memberships = await listUserListMembershipsByUserListIdWithPaginationFromDatabase(deps.db, userList.id, {
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packUserListMembershipsManyForApi(deps, memberships);
}

export const updateMembershipParamDef = z.object({
	listId: misskeyId(),
	userId: misskeyId(),
	withReplies: z.boolean().optional(),
});

type UpdateMembershipParams = {
	listId: string;
	userId: string;
	withReplies?: boolean;
};

export async function handleApiUsersListsUpdateMembership(
	deps: ApiUsersListsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(updateMembershipParamDef, body);

	const userList = await fetchUserListByIdAndUserIdFromDatabase(deps.db, params.listId, me.id);
	if (userList == null) throw noSuchListError('7f44670e-ab16-43b8-b4c1-ccd2ee89cc02');

	const user = await getUserForApi(deps, params.userId, '588e7f72-c744-4a61-b180-d354e912bda2');

	await updateUserListMembershipForApi(
		deps,
		user,
		userList,
		omitUndefined({
			withReplies: params.withReplies,
		}),
	);
}
