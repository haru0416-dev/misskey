/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { enqueueDeliverJob } from '@/core/queue/DeliverQueue.js';
import {
	createBlockingInDatabase,
	deleteBlockingByIdFromDatabase,
	fetchBlockingByBlockerIdAndBlockeeIdFromDatabase,
	listBlockingsByBlockerIdWithPaginationFromDatabase,
	resolveBlockingPagination,
} from '@/core/user/BlockingStore.js';
import { deleteFollowRequestByIdFromDatabase, fetchFollowRequestFromDatabase } from '@/core/user/FollowRequestStore.js';
import {
	deleteFollowingAndUpdateUserCountsByIdInDatabase,
	fetchFollowingByFollowerIdAndFolloweeIdFromDatabase,
} from '@/core/user/FollowingStore.js';
import {
	adjustInstanceFollowersCountFromDatabase,
	adjustInstanceFollowingCountFromDatabase,
} from '@/core/instance/InstanceStore.js';
import type { DeliverQueue, UserWebhookDeliverQueue } from '@/core/queue/queues.js';
import { fetchUserByIdFromDatabase, fetchUserByIdOrFailFromDatabase } from '@/core/user/UserStore.js';
import { deleteUserListMembershipsByUserIdAndListOwnerIdInDatabase } from '@/core/user/UserListMembershipStore.js';
import type { IActivity, IBlock } from '@/core/activitypub/type.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiBlocking } from '@/models/Blocking.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { ApiError, clientError } from '../error.js';
import type { ApiInternalEventPublisher, ApiMainStreamPublisher } from '../events.js';
import { fetchOrRegisterFederatedInstance } from '../activitypub/federation.js';
import {
	addActivityContext,
	genLocalUserUri,
	isLocalUser,
	isRemoteUser,
	publishUnfollowToLocalFollower,
	renderFollow,
	renderReject,
	renderUndo,
} from '../user/following.js';
import {
	packMeDetailedForApi,
	packUserDetailedNotMeForApi,
	packUserDetailedNotMeManyForApi,
	type UserDetailedNotMeApiResponse,
	type UserPackingDependencies,
} from '../user/user.js';
import { parseApiParams } from '../validation.js';

export type ApiAccountBlockingDependencies = UserPackingDependencies & {
	config: Config;
	db: MiDrizzleDatabase;
	deliverQueue: DeliverQueue;
	userWebhookDeliverQueue: UserWebhookDeliverQueue;
	publishInternalEvent?: ApiInternalEventPublisher;
	publishMainStream?: ApiMainStreamPublisher;
};

export const userIdParamDef = z.object({
	userId: misskeyId(),
});

export const blockingListParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(30),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
});

type ApiBlockingResponse = {
	id: string;
	createdAt: string;
	blockeeId: MiUser['id'];
	blockee: UserDetailedNotMeApiResponse;
};

function blockingCreateNoSuchUserError(): ApiError {
	return clientError('No such user.', 'NO_SUCH_USER', '7cc4f851-e2f1-4621-9633-ec9e1d00c01e');
}

function blockingDeleteNoSuchUserError(): ApiError {
	return clientError('No such user.', 'NO_SUCH_USER', '8621d8bf-c358-4303-a066-5ea78610eb3f');
}

function renderBlock(config: Config, blocking: MiBlocking & { blockee: MiUser }): IBlock {
	if (blocking.blockee.uri == null) {
		throw new Error('renderBlock: missing blockee uri');
	}

	return {
		type: 'Block',
		id: `${config.instance.url}/blocks/${blocking.id}`,
		actor: genLocalUserUri(config, blocking.blockerId),
		object: blocking.blockee.uri,
	};
}

async function getTargetUserOrThrow(
	deps: ApiAccountBlockingDependencies,
	userId: MiUser['id'],
	errorFactory: () => ApiError,
): Promise<MiUser> {
	const user = await fetchUserByIdFromDatabase(deps.db, userId);
	if (user == null) throw errorFactory();

	return user;
}

async function deliverFollowCancelActivity(
	deps: ApiAccountBlockingDependencies,
	follower: MiUser,
	followee: MiUser,
	requestId?: string | null,
): Promise<void> {
	if (isLocalUser(follower) && isRemoteUser(followee)) {
		const content = addActivityContext(
			deps.config,
			renderUndo(deps.config, renderFollow(deps.config, follower, followee, requestId), follower),
		);
		enqueueDeliverJob(deps.deliverQueue, deps.config, follower, content as IActivity, followee.inbox, false);
		return;
	}

	if (isRemoteUser(follower) && isLocalUser(followee)) {
		const content = addActivityContext(
			deps.config,
			renderReject(deps.config, renderFollow(deps.config, follower, followee, requestId), followee),
		);
		enqueueDeliverJob(deps.deliverQueue, deps.config, followee, content as IActivity, follower.inbox, false);
	}
}

export async function cancelFollowRequest(
	deps: ApiAccountBlockingDependencies,
	follower: MiUser,
	followee: MiUser,
	silent = false,
): Promise<void> {
	const request = await fetchFollowRequestFromDatabase(deps.db, follower.id, followee.id);
	if (request == null) return;

	await deleteFollowRequestByIdFromDatabase(deps.db, request.id);

	if (isLocalUser(followee)) {
		deps.publishMainStream?.(
			followee.id,
			'meUpdated',
			await packMeDetailedForApi(deps, followee, {
				includeSecrets: false,
			}),
		);
	}

	if (!silent) {
		await publishUnfollowToLocalFollower(deps, follower, followee);
	}

	await deliverFollowCancelActivity(deps, follower, followee, request.requestId);
}

async function decrementFollowing(
	deps: ApiAccountBlockingDependencies,
	follower: MiUser,
	followee: MiUser,
): Promise<void> {
	deps.publishInternalEvent?.('unfollow', { followerId: follower.id, followeeId: followee.id });

	if (!follower.movedToUri && !followee.movedToUri) {
		if (deps.meta.enableStatsForFederatedInstances) {
			if (isRemoteUser(follower) && isLocalUser(followee)) {
				const instance = await fetchOrRegisterFederatedInstance(deps, follower.host);
				await adjustInstanceFollowingCountFromDatabase(deps.db, instance.id, -1);
			} else if (isLocalUser(follower) && isRemoteUser(followee)) {
				const instance = await fetchOrRegisterFederatedInstance(deps, followee.host);
				await adjustInstanceFollowersCountFromDatabase(deps.db, instance.id, -1);
			}
		}
		return;
	}
}

export async function unfollow(
	deps: ApiAccountBlockingDependencies,
	follower: MiUser,
	followee: MiUser,
	silent = false,
): Promise<void> {
	const following = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(deps.db, follower.id, followee.id);
	if (following == null) return;

	const [followingFollower, followingFollowee] = await Promise.all([
		fetchUserByIdFromDatabase(deps.db, following.followerId),
		fetchUserByIdFromDatabase(deps.db, following.followeeId),
	]);
	if (followingFollower == null || followingFollowee == null) return;

	const deleted = await deleteFollowingAndUpdateUserCountsByIdInDatabase(
		deps.db,
		following.id,
		followingFollower.id,
		followingFollowee.id,
	);
	if (!deleted) return;

	await decrementFollowing(deps, followingFollower, followingFollowee);

	if (!silent) {
		await publishUnfollowToLocalFollower(deps, follower, followee);
	}

	await deliverFollowCancelActivity(deps, follower, followee);
}

/**
 * リモートのフォロー対象から Reject を受信したときは、一切配送せず関係だけを削除する。
 */
export async function remoteRejectForApi(
	deps: ApiAccountBlockingDependencies,
	actor: MiUser,
	follower: MiUser,
): Promise<void> {
	const request = await fetchFollowRequestFromDatabase(deps.db, follower.id, actor.id);
	if (request != null) {
		await deleteFollowRequestByIdFromDatabase(deps.db, request.id);
	}

	const following = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(deps.db, follower.id, actor.id);
	if (following != null) {
		const [followingFollower, followingFollowee] = await Promise.all([
			fetchUserByIdFromDatabase(deps.db, following.followerId),
			fetchUserByIdFromDatabase(deps.db, following.followeeId),
		]);
		if (followingFollower != null && followingFollowee != null) {
			const deleted = await deleteFollowingAndUpdateUserCountsByIdInDatabase(
				deps.db,
				following.id,
				followingFollower.id,
				followingFollowee.id,
			);
			if (deleted) {
				await decrementFollowing(deps, followingFollower, followingFollowee);
			}
		}
	}

	await publishUnfollowToLocalFollower(deps, follower, actor);
}

async function removeFromList(deps: ApiAccountBlockingDependencies, listOwner: MiUser, user: MiUser): Promise<void> {
	await deleteUserListMembershipsByUserIdAndListOwnerIdInDatabase(deps.db, user.id, listOwner.id);
}

async function packApiBlocking(
	deps: ApiAccountBlockingDependencies,
	blocking: MiBlocking,
	me: { id: MiUser['id'] },
	packedBlockee?: UserDetailedNotMeApiResponse,
): Promise<ApiBlockingResponse> {
	const blockee =
		packedBlockee ??
		(await packUserDetailedNotMeForApi(
			deps,
			blocking.blockee ?? (await fetchUserByIdOrFailFromDatabase(deps.db, blocking.blockeeId)),
			me,
		));

	return {
		id: blocking.id,
		createdAt: parseId(blocking.id).date.toISOString(),
		blockeeId: blocking.blockeeId,
		blockee,
	};
}

async function deliverBlockActivity(
	deps: ApiAccountBlockingDependencies,
	blocking: MiBlocking & { blocker: MiUser; blockee: MiUser },
): Promise<void> {
	if (!isLocalUser(blocking.blocker) || !isRemoteUser(blocking.blockee)) return;

	const content = addActivityContext(deps.config, renderBlock(deps.config, blocking));
	enqueueDeliverJob(
		deps.deliverQueue,
		deps.config,
		blocking.blocker,
		content as IActivity,
		blocking.blockee.inbox,
		false,
	);
}

async function deliverUndoBlockActivity(
	deps: ApiAccountBlockingDependencies,
	blocking: MiBlocking & { blocker: MiUser; blockee: MiUser },
): Promise<void> {
	if (!isLocalUser(blocking.blocker) || !isRemoteUser(blocking.blockee)) return;

	const block = renderBlock(deps.config, blocking);
	const content = addActivityContext(deps.config, renderUndo(deps.config, block, blocking.blocker));
	enqueueDeliverJob(
		deps.deliverQueue,
		deps.config,
		blocking.blocker,
		content as IActivity,
		blocking.blockee.inbox,
		false,
	);
}

/** 自分自身・二重ブロックのガードは呼び出し側の責務。 */
export async function blockForApi(
	deps: ApiAccountBlockingDependencies,
	blocker: MiUser,
	blockee: MiUser,
	silent?: boolean,
): Promise<MiBlocking & { blocker: MiUser; blockee: MiUser }> {
	await Promise.all([
		cancelFollowRequest(deps, blocker, blockee, silent),
		cancelFollowRequest(deps, blockee, blocker, silent),
		unfollow(deps, blocker, blockee, silent),
		unfollow(deps, blockee, blocker, silent),
		removeFromList(deps, blockee, blocker),
	]);

	const blocking = (await createBlockingInDatabase(deps.db, {
		id: genId(),
		blockerId: blocker.id,
		blockeeId: blockee.id,
	})) as MiBlocking & { blocker: MiUser; blockee: MiUser };
	blocking.blocker = blocker;
	blocking.blockee = blockee;

	deps.publishInternalEvent?.('blockingCreated', { blockerId: blocker.id, blockeeId: blockee.id });
	await deliverBlockActivity(deps, blocking);

	return blocking;
}

export async function handleApiBlockingCreate(
	deps: ApiAccountBlockingDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<UserDetailedNotMeApiResponse> {
	const params = parseApiParams(userIdParamDef, body);
	const blocker = await fetchUserByIdOrFailFromDatabase(deps.db, me.id);

	if (blocker.id === params.userId) {
		throw clientError('Blockee is yourself.', 'BLOCKEE_IS_YOURSELF', '88b19138-f28d-42c0-8499-6a31bbd0fdc6');
	}

	const blockee = await getTargetUserOrThrow(deps, params.userId, blockingCreateNoSuchUserError);
	if ((await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(deps.db, blocker.id, blockee.id)) != null) {
		throw clientError(
			'You are already blocking that user.',
			'ALREADY_BLOCKING',
			'787fed64-acb9-464a-82eb-afbd745b9614',
		);
	}

	const blocking = await blockForApi(deps, blocker, blockee);

	return await packUserDetailedNotMeForApi(deps, blocking.blockee, blocking.blocker);
}

/** ブロック行が存在しない場合は何もしない。 */
export async function unblockForApi(
	deps: ApiAccountBlockingDependencies,
	blocker: MiUser,
	blockee: MiUser,
): Promise<void> {
	const blocking = await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(deps.db, blocker.id, blockee.id);
	if (blocking == null) return;

	blocking.blocker = blocker;
	blocking.blockee = blockee;

	await deleteBlockingByIdFromDatabase(deps.db, blocking.id);
	deps.publishInternalEvent?.('blockingDeleted', { blockerId: blocker.id, blockeeId: blockee.id });
	await deliverUndoBlockActivity(deps, blocking as MiBlocking & { blocker: MiUser; blockee: MiUser });
}

export async function handleApiBlockingDelete(
	deps: ApiAccountBlockingDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<UserDetailedNotMeApiResponse> {
	const params = parseApiParams(userIdParamDef, body);
	const blocker = await fetchUserByIdOrFailFromDatabase(deps.db, me.id);

	if (blocker.id === params.userId) {
		throw clientError('Blockee is yourself.', 'BLOCKEE_IS_YOURSELF', '06f6fac6-524b-473c-a354-e97a40ae6eac');
	}

	const blockee = await getTargetUserOrThrow(deps, params.userId, blockingDeleteNoSuchUserError);
	const existing = await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(deps.db, blocker.id, blockee.id);
	if (existing == null) {
		throw clientError('You are not blocking that user.', 'NOT_BLOCKING', '291b2efa-60c6-45c0-9f6a-045c8f9b02cd');
	}

	await unblockForApi(deps, blocker, blockee);

	return await packUserDetailedNotMeForApi(deps, blockee, blocker);
}

export async function handleApiBlockingList(
	deps: ApiAccountBlockingDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Blocking'>[]> {
	const params = parseApiParams(blockingListParamDef, body);
	const blockings = await listBlockingsByBlockerIdWithPaginationFromDatabase(deps.db, me.id, {
		...resolveBlockingPagination(
			{
				gen: (time) => genId(time),
			},
			params,
		),
		limit: params.limit,
	});

	const blockees = await packUserDetailedNotMeManyForApi(
		deps,
		blockings.map((blocking) => blocking.blockee ?? blocking.blockeeId),
		me,
	);
	return await Promise.all(
		blockings.map(
			(blocking, index) => packApiBlocking(deps, blocking, me, blockees[index]) as Promise<Packed<'Blocking'>>,
		),
	);
}
