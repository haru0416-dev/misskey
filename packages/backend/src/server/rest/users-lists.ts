/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { blockingExistsInDatabase } from '@/core/BlockingStore.js';
import type { RelationshipQueue } from '@/core/queues.js';
import { fetchOrCreateSystemAccountInDatabase } from '@/core/SystemAccountLogic.js';
import {
	countUserListMembershipsByUserListIdInDatabase,
	createUserListMembershipInDatabase,
	deleteUserListMembershipInDatabase,
	fetchUserListMembershipByUserIdAndUserListIdFromDatabase,
	listUserListMembershipsByUserListIdWithPaginationFromDatabase,
	listUserListMembershipUserIdsByUserListIdFromDatabase,
	resolveUserListMembershipPagination,
	updateUserListMembershipWithRepliesInDatabase,
	userListMembershipExistsInDatabase,
} from '@/core/UserListMembershipStore.js';
import {
	countUserListsByUserIdFromDatabase,
	createUserListInDatabase,
	fetchPublicUserListByIdFromDatabase,
	fetchUserListByIdAndUserIdFromDatabase,
	userListExistsByIdAndPublicFromDatabase,
} from '@/core/UserListStore.js';
import { fetchUserByIdFromDatabase } from '@/core/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { UserListMembershipRow } from '@/db/schema/user-list-membership.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { MiUserList } from '@/models/UserList.js';
import { HonoApiError } from './error.js';
import type { HonoApiInternalEventPublisher, HonoApiUserListStreamPublisher } from './events.js';
import { packUserLiteForHonoApi, packUserLiteManyForHonoApi, type UserPackingDependencies } from './user.js';
import { getHonoApiRolePolicies, type HonoApiRolePolicyDependencies } from './role-policy.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiUsersListsDependencies = UserPackingDependencies & HonoApiRolePolicyDependencies & {
	relationshipQueue: RelationshipQueue;
	publishInternalEvent?: HonoApiInternalEventPublisher;
	publishUserListStream?: HonoApiUserListStreamPublisher;
};

class TooManyUsersError extends Error {}

async function packUserListByRowForHonoApi(
	deps: HonoApiUsersListsDependencies,
	userList: MiUserList,
): Promise<{ id: string; createdAt: string; name: string; userIds: string[]; isPublic: boolean }> {
	const userIds = await listUserListMembershipUserIdsByUserListIdFromDatabase(deps.db, userList.id);

	return {
		id: userList.id,
		createdAt: parseId(deps.config, userList.id).date.toISOString(),
		name: userList.name,
		userIds,
		isPublic: userList.isPublic,
	};
}

async function packUserListMembershipsManyForHonoApi(
	deps: HonoApiUsersListsDependencies,
	memberships: UserListMembershipRow[],
): Promise<{ id: string; createdAt: string; userId: string; user: Packed<'UserLite'>; withReplies: boolean }[]> {
	const packedUsers = await packUserLiteManyForHonoApi(deps, memberships.map(({ userId }) => userId));
	const userMap = new Map(packedUsers.map(u => [u.id, u]));

	return await Promise.all(memberships.map(async membership => ({
		id: membership.id,
		createdAt: parseId(deps.config, membership.id).date.toISOString(),
		userId: membership.userId,
		user: userMap.get(membership.userId) ?? await packUserLiteForHonoApi(deps, membership.userId),
		withReplies: membership.withReplies,
	})));
}

function createFollowJobForHonoApi(
	deps: HonoApiUsersListsDependencies,
	followings: { from: { id: MiUser['id'] }; to: { id: MiUser['id'] } }[],
): Promise<unknown> {
	const jobs = followings.map(rel => ({
		name: 'follow',
		data: {
			from: { id: rel.from.id },
			to: { id: rel.to.id },
		},
		opts: {
			removeOnComplete: {
				age: 3600 * 24 * 7,
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7,
				count: 100,
			},
		},
	}));
	return deps.relationshipQueue.addBulk(jobs);
}

export async function addUserListMemberForHonoApi(
	deps: HonoApiUsersListsDependencies,
	target: MiUser,
	list: MiUserList,
	me: MiUser,
	options: { withReplies?: boolean } = {},
): Promise<void> {
	const policies = await getHonoApiRolePolicies(deps, me);
	const currentCount = await countUserListMembershipsByUserListIdInDatabase(deps.db, list.id);
	if (currentCount >= policies.userEachUserListsLimit) {
		throw new TooManyUsersError();
	}

	await createUserListMembershipInDatabase(deps.db, {
		id: genId(deps.config),
		userId: target.id,
		userListId: list.id,
		userListUserId: list.userId,
		withReplies: options.withReplies ?? false,
	});

	deps.publishInternalEvent?.('userListMemberAdded', { userListId: list.id, memberId: target.id });
	deps.publishUserListStream?.(list.id, 'userAdded', await packUserLiteForHonoApi(deps, target));

	if (target.host != null) {
		const proxy = await fetchOrCreateSystemAccountInDatabase({ db: deps.db, meta: deps.meta, genId: () => genId(deps.config) }, 'proxy');
		await createFollowJobForHonoApi(deps, [{ from: { id: proxy.id }, to: { id: target.id } }]);
	}
}

async function removeUserListMemberForHonoApi(
	deps: HonoApiUsersListsDependencies,
	target: MiUser,
	list: MiUserList,
): Promise<void> {
	await deleteUserListMembershipInDatabase(deps.db, target.id, list.id);

	deps.publishInternalEvent?.('userListMemberRemoved', { userListId: list.id, memberId: target.id });
	deps.publishUserListStream?.(list.id, 'userRemoved', await packUserLiteForHonoApi(deps, target));
}

async function updateUserListMembershipForHonoApi(
	deps: HonoApiUsersListsDependencies,
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

function noSuchListError(id: string): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such list.', code: 'NO_SUCH_LIST', id });
}

function noSuchUserError(id: string): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such user.', code: 'NO_SUCH_USER', id });
}

async function getUserForHonoApi(deps: HonoApiUsersListsDependencies, userId: string, noSuchUserErrorId: string): Promise<MiUser> {
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

export async function handleHonoApiUsersListsCreate(
	deps: HonoApiUsersListsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ id: string; createdAt: string; name: string; userIds: string[]; isPublic: boolean }> {
	const params = parseHonoApiParams(createParamDef, body);

	const policies = await getHonoApiRolePolicies(deps, me);
	const currentCount = await countUserListsByUserIdFromDatabase(deps.db, me.id);
	if (currentCount >= policies.userListLimit) {
		throw new HonoApiError({ status: 400, message: 'You cannot create user list any more.', code: 'TOO_MANY_USERLISTS', id: '0cf21a28-7715-4f39-a20d-777bfdb8d138' });
	}

	const userList = await createUserListInDatabase(deps.db, {
		id: genId(deps.config),
		userId: me.id,
		name: params.name,
	});

	return await packUserListByRowForHonoApi(deps, userList);
}

export const createFromPublicParamDef = z.object({
	name: z.string().min(1).max(100),
	listId: misskeyId(),
});

type CreateFromPublicParams = {
	name: string;
	listId: string;
};

export async function handleHonoApiUsersListsCreateFromPublic(
	deps: HonoApiUsersListsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ id: string; createdAt: string; name: string; userIds: string[]; isPublic: boolean }> {
	const params = parseHonoApiParams(createFromPublicParamDef, body);

	const listExists = await userListExistsByIdAndPublicFromDatabase(deps.db, params.listId);
	if (!listExists) throw noSuchListError('9292f798-6175-4f7d-93f4-b6742279667d');

	const policies = await getHonoApiRolePolicies(deps, me);
	const currentCount = await countUserListsByUserIdFromDatabase(deps.db, me.id);
	if (currentCount >= policies.userListLimit) {
		throw new HonoApiError({ status: 400, message: 'You cannot create user list any more.', code: 'TOO_MANY_USERLISTS', id: 'e9c105b2-c595-47de-97fb-7f7c2c33e92f' });
	}

	const userList = await createUserListInDatabase(deps.db, {
		id: genId(deps.config),
		userId: me.id,
		name: params.name,
	});

	const users = await listUserListMembershipUserIdsByUserListIdFromDatabase(deps.db, params.listId);

	for (const userId of users) {
		const currentUser = await getUserForHonoApi(deps, userId, '13c457db-a8cb-4d88-b70a-211ceeeabb5f');

		if (currentUser.id !== me.id) {
			const blockExist = await blockingExistsInDatabase(deps.db, currentUser.id, me.id);
			if (blockExist) {
				throw new HonoApiError({ status: 400, message: 'You cannot push this user because you have been blocked by this user.', code: 'YOU_HAVE_BEEN_BLOCKED', id: 'a2497f2a-2389-439c-8626-5298540530f4' });
			}
		}

		const exists = await userListMembershipExistsInDatabase(deps.db, currentUser.id, userList.id);
		if (exists) {
			throw new HonoApiError({ status: 400, message: 'That user has already been added to that list.', code: 'ALREADY_ADDED', id: 'c3ad6fdb-692b-47ee-a455-7bd12c7af615' });
		}

		try {
			await addUserListMemberForHonoApi(deps, currentUser, userList, me);
		} catch (err) {
			if (err instanceof TooManyUsersError) {
				throw new HonoApiError({ status: 400, message: 'You can not push users any more.', code: 'TOO_MANY_USERS', id: '1845ea77-38d1-426e-8e4e-8b83b24f5bd7' });
			}
			throw err;
		}
	}

	return await packUserListByRowForHonoApi(deps, userList);
}

export const pullParamDef = z.object({
	listId: misskeyId(),
	userId: misskeyId(),
});

type PullParams = {
	listId: string;
	userId: string;
};

export async function handleHonoApiUsersListsPull(
	deps: HonoApiUsersListsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(pullParamDef, body);

	const userList = await fetchUserListByIdAndUserIdFromDatabase(deps.db, params.listId, me.id);
	if (userList == null) throw noSuchListError('7f44670e-ab16-43b8-b4c1-ccd2ee89cc02');

	const user = await getUserForHonoApi(deps, params.userId, '588e7f72-c744-4a61-b180-d354e912bda2');

	await removeUserListMemberForHonoApi(deps, user, userList);
}

export const pushParamDef = z.object({
	listId: misskeyId(),
	userId: misskeyId(),
});

type PushParams = {
	listId: string;
	userId: string;
};

export async function handleHonoApiUsersListsPush(
	deps: HonoApiUsersListsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(pushParamDef, body);

	const userList = await fetchUserListByIdAndUserIdFromDatabase(deps.db, params.listId, me.id);
	if (userList == null) throw noSuchListError('2214501d-ac96-4049-b717-91e42272a711');

	const user = await getUserForHonoApi(deps, params.userId, 'a89abd3d-f0bc-4cce-beb1-2f446f4f1e6a');

	if (user.id !== me.id) {
		const blockExist = await blockingExistsInDatabase(deps.db, user.id, me.id);
		if (blockExist) {
			throw new HonoApiError({ status: 400, message: 'You cannot push this user because you have been blocked by this user.', code: 'YOU_HAVE_BEEN_BLOCKED', id: '990232c5-3f9d-4d83-9f3f-ef27b6332a4b' });
		}
	}

	const exists = await userListMembershipExistsInDatabase(deps.db, user.id, userList.id);
	if (exists) {
		throw new HonoApiError({ status: 400, message: 'That user has already been added to that list.', code: 'ALREADY_ADDED', id: '1de7c884-1595-49e9-857e-61f12f4d4fc5' });
	}

	try {
		await addUserListMemberForHonoApi(deps, user, userList, me);
	} catch (err) {
		if (err instanceof TooManyUsersError) {
			throw new HonoApiError({ status: 400, message: 'You can not push users any more.', code: 'TOO_MANY_USERS', id: '2dd9752e-a338-413d-8eec-41814430989b' });
		}
		throw err;
	}
}

export const getMembershipsParamDef = z.object({
	listId: misskeyId(),
	forPublic: z.boolean().default(false),
	limit: z.number().int().min(1).max(100).default(30),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
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

export async function handleHonoApiUsersListsGetMemberships(
	deps: HonoApiUsersListsDependencies,
	me: MiLocalUser | null,
	body: Record<string, unknown>,
): Promise<{ id: string; createdAt: string; userId: string; user: Packed<'UserLite'>; withReplies: boolean }[]> {
	const params = parseHonoApiParams(getMembershipsParamDef, body);

	const userList = !params.forPublic && me != null
		? await fetchUserListByIdAndUserIdFromDatabase(deps.db, params.listId, me.id)
		: await fetchPublicUserListByIdFromDatabase(deps.db, params.listId);

	if (userList == null) throw noSuchListError('7bc05c21-1d7a-41ae-88f1-66820f4dc686');

	const pagination = resolveUserListMembershipPagination({ gen: (time) => genId(deps.config, time) }, params);
	const memberships = await listUserListMembershipsByUserListIdWithPaginationFromDatabase(deps.db, userList.id, {
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packUserListMembershipsManyForHonoApi(deps, memberships);
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

export async function handleHonoApiUsersListsUpdateMembership(
	deps: HonoApiUsersListsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(updateMembershipParamDef, body);

	const userList = await fetchUserListByIdAndUserIdFromDatabase(deps.db, params.listId, me.id);
	if (userList == null) throw noSuchListError('7f44670e-ab16-43b8-b4c1-ccd2ee89cc02');

	const user = await getUserForHonoApi(deps, params.userId, '588e7f72-c744-4a61-b180-d354e912bda2');

	await updateUserListMembershipForHonoApi(deps, user, userList, {
		withReplies: params.withReplies,
	});
}
