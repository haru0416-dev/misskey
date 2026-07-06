/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import type * as Redis from 'ioredis';
import { z } from 'zod';
import { enqueueDeliverJob } from '@/core/DeliverQueue.js';
import { createBlockingInDatabase, deleteBlockingByIdFromDatabase, fetchBlockingByBlockerIdAndBlockeeIdFromDatabase, listBlockeeIdsByBlockerIdFromDatabase, listBlockerIdsByBlockeeIdFromDatabase, listBlockingsByBlockerIdWithPaginationFromDatabase, resolveBlockingPagination } from '@/core/BlockingStore.js';
import { deleteFollowRequestByIdFromDatabase, fetchFollowRequestFromDatabase } from '@/core/FollowRequestStore.js';
import { countNonMovedFolloweesByFollowerIdFromDatabase, countNonMovedFollowersByFolloweeIdFromDatabase, deleteFollowingByIdInDatabase, fetchFollowingByFollowerIdAndFolloweeIdFromDatabase, listFolloweeIdsWithRepliesByFollowerIdFromDatabase } from '@/core/FollowingStore.js';
import { adjustInstanceFollowersCountFromDatabase, adjustInstanceFollowingCountFromDatabase } from '@/core/InstanceStore.js';
import type { DeliverQueue, UserWebhookDeliverQueue } from '@/core/QueueModule.js';
import { adjustUserFollowersCountInDatabase, adjustUserFollowingCountInDatabase, fetchUserByIdFromDatabase, fetchUserByIdOrFailFromDatabase, updateUserInDatabase } from '@/core/UserStore.js';
import { deleteUserListMembershipInDatabase } from '@/core/UserListMembershipStore.js';
import { listUserListsByUserIdFromDatabase } from '@/core/UserListStore.js';
import { listWebhooksFromDatabase } from '@/core/WebhookStore.js';
import type { IActivity, IBlock, IObject } from '@/core/activitypub/type.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed, SchemaType } from '@/misc/json-schema.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiBlocking } from '@/models/Blocking.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { UserWebhookDeliverJobData } from '@/queue/types.js';
import { HonoApiError, clientError } from './error.js';
import type { HonoApiInternalEventPublisher, HonoApiMainStreamPublisher } from './events.js';
import { fetchOrRegisterFederatedInstance } from './federation.js';
import { addActivityContext, genLocalUserUri, isLocalUser, isRemoteUser, refreshUserFollowingsCache, renderFollow, renderReject, renderUndo } from './following.js';
import { packMeDetailedForHonoApi, packUserDetailedNotMeForHonoApi, type UserDetailedNotMeHonoApiResponse, type UserPackingDependencies } from './user.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiAccountBlockingDependencies = UserPackingDependencies & {
	config: Config;
	db: MiDrizzleDatabase;
	redis: Redis.Redis;
	deliverQueue: DeliverQueue;
	userWebhookDeliverQueue: UserWebhookDeliverQueue;
	publishInternalEvent?: HonoApiInternalEventPublisher;
	publishMainStream?: HonoApiMainStreamPublisher;
};

const userIdParamDef = z.object({
	userId: misskeyId(),
});

const blockingListParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(30),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
});


type HonoApiBlockingResponse = {
	id: string;
	createdAt: string;
	blockeeId: MiUser['id'];
	blockee: UserDetailedNotMeHonoApiResponse;
};

function blockingCreateNoSuchUserError(): HonoApiError {
	return clientError('No such user.', 'NO_SUCH_USER', '7cc4f851-e2f1-4621-9633-ec9e1d00c01e');
}

function blockingDeleteNoSuchUserError(): HonoApiError {
	return clientError('No such user.', 'NO_SUCH_USER', '8621d8bf-c358-4303-a066-5ea78610eb3f');
}

function renderBlock(config: Config, blocking: MiBlocking & { blockee: MiUser }): IBlock {
	if (blocking.blockee.uri == null) {
		throw new Error('renderBlock: missing blockee uri');
	}

	return {
		type: 'Block',
		id: `${config.url}/blocks/${blocking.id}`,
		actor: genLocalUserUri(config, blocking.blockerId),
		object: blocking.blockee.uri,
	};
}

async function getTargetUserOrThrow(
	deps: HonoApiAccountBlockingDependencies,
	userId: MiUser['id'],
	errorFactory: () => HonoApiError,
): Promise<MiUser> {
	const user = await fetchUserByIdFromDatabase(deps.db, userId);
	if (user == null) throw errorFactory();

	return user;
}

export async function refreshUserBlockingCache(deps: HonoApiAccountBlockingDependencies, blockerId: MiUser['id']): Promise<void> {
	const blockeeIds = await listBlockeeIdsByBlockerIdFromDatabase(deps.db, blockerId);
	await deps.redis.set(`kvcache:userBlocking:${blockerId}`, JSON.stringify(blockeeIds), 'EX', 60 * 30);
}

export async function refreshUserBlockedCache(deps: HonoApiAccountBlockingDependencies, blockeeId: MiUser['id']): Promise<void> {
	const blockerIds = await listBlockerIdsByBlockeeIdFromDatabase(deps.db, blockeeId);
	await deps.redis.set(`kvcache:userBlocked:${blockeeId}`, JSON.stringify(blockerIds), 'EX', 60 * 30);
}

async function enqueueUnfollowWebhook(
	deps: HonoApiAccountBlockingDependencies,
	userId: MiUser['id'],
	user: Packed<'UserDetailedNotMe'>,
): Promise<void> {
	const webhooks = (await listWebhooksFromDatabase(deps.db, {
		isActive: true,
		on: ['unfollow'],
	})).filter(webhook => webhook.userId === userId && webhook.on.includes('unfollow'));

	await Promise.all(webhooks.map(webhook => {
		const data: UserWebhookDeliverJobData<'unfollow'> = {
			type: 'unfollow',
			content: { user },
			webhookId: webhook.id,
			userId: webhook.userId,
			to: webhook.url,
			secret: webhook.secret,
			createdAt: Date.now(),
			eventId: randomUUID(),
		};

		return deps.userWebhookDeliverQueue.add(webhook.id, data, {
			attempts: 4,
			backoff: {
				type: 'custom',
			},
			removeOnComplete: {
				age: 3600 * 24 * 7,
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7,
				count: 100,
			},
		});
	}));
}

export async function publishUnfollowToLocalFollower(
	deps: HonoApiAccountBlockingDependencies,
	follower: MiUser,
	followee: MiUser,
): Promise<void> {
	if (!isLocalUser(follower)) return;

	const packedFollowee = await packUserDetailedNotMeForHonoApi(deps, followee) as Packed<'UserDetailedNotMe'>;
	deps.publishMainStream?.(follower.id, 'unfollow', packedFollowee);
	await enqueueUnfollowWebhook(deps, follower.id, packedFollowee);
}

async function deliverFollowCancelActivity(
	deps: HonoApiAccountBlockingDependencies,
	follower: MiUser,
	followee: MiUser,
	requestId?: string | null,
): Promise<void> {
	if (isLocalUser(follower) && isRemoteUser(followee)) {
		const content = addActivityContext(deps.config, renderUndo(
			deps.config,
			renderFollow(deps.config, follower, followee, requestId),
			follower,
		));
		enqueueDeliverJob(deps.deliverQueue, deps.config, follower, content as IActivity, followee.inbox, false);
		return;
	}

	if (isRemoteUser(follower) && isLocalUser(followee)) {
		const content = addActivityContext(deps.config, renderReject(
			deps.config,
			renderFollow(deps.config, follower, followee, requestId),
			followee,
		));
		enqueueDeliverJob(deps.deliverQueue, deps.config, followee, content as IActivity, follower.inbox, false);
	}
}

export async function cancelFollowRequest(
	deps: HonoApiAccountBlockingDependencies,
	follower: MiUser,
	followee: MiUser,
	silent = false,
): Promise<void> {
	const request = await fetchFollowRequestFromDatabase(deps.db, follower.id, followee.id);
	if (request == null) return;

	await deleteFollowRequestByIdFromDatabase(deps.db, request.id);

	if (isLocalUser(followee)) {
		deps.publishMainStream?.(followee.id, 'meUpdated', await packMeDetailedForHonoApi(deps, followee, {
			includeSecrets: false,
		}));
	}

	if (!silent) {
		await publishUnfollowToLocalFollower(deps, follower, followee);
	}

	await deliverFollowCancelActivity(deps, follower, followee, request.requestId);
}

export async function decrementFollowing(
	deps: HonoApiAccountBlockingDependencies,
	follower: MiUser,
	followee: MiUser,
): Promise<void> {
	deps.publishInternalEvent?.('unfollow', { followerId: follower.id, followeeId: followee.id });

	if (!follower.movedToUri && !followee.movedToUri) {
		await Promise.all([
			adjustUserFollowingCountInDatabase(deps.db, follower.id, -1),
			adjustUserFollowersCountInDatabase(deps.db, followee.id, -1),
		]);

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

	for (const user of [follower, followee]) {
		if (user.movedToUri) continue;

		const [nonMovedFollowees, nonMovedFollowers] = await Promise.all([
			countNonMovedFolloweesByFollowerIdFromDatabase(deps.db, user.id),
			countNonMovedFollowersByFolloweeIdFromDatabase(deps.db, user.id),
		]);
		await updateUserInDatabase(deps.db, user.id, {
			followingCount: nonMovedFollowees,
			followersCount: nonMovedFollowers,
		});
	}
}

export async function unfollow(
	deps: HonoApiAccountBlockingDependencies,
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

	await deleteFollowingByIdInDatabase(deps.db, following.id);
	await refreshUserFollowingsCache(deps, follower.id);
	await decrementFollowing(deps, followingFollower, followingFollowee);

	if (!silent) {
		await publishUnfollowToLocalFollower(deps, follower, followee);
	}

	await deliverFollowCancelActivity(deps, follower, followee);
}

/**
 * UserFollowingService.remoteReject 相当。リモートのフォロー対象から Reject を受信したときの後始末で、
 * unfollow() と異なり (受信した Reject への応答として) 一切配送を行わない。
 */
export async function remoteRejectForHonoApi(
	deps: HonoApiAccountBlockingDependencies,
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
			await deleteFollowingByIdInDatabase(deps.db, following.id);
			await refreshUserFollowingsCache(deps, follower.id);
			await decrementFollowing(deps, followingFollower, followingFollowee);
		}
	}

	await publishUnfollowToLocalFollower(deps, follower, actor);
}

export async function removeFromList(
	deps: HonoApiAccountBlockingDependencies,
	listOwner: MiUser,
	user: MiUser,
): Promise<void> {
	const userLists = await listUserListsByUserIdFromDatabase(deps.db, listOwner.id);
	await Promise.all(userLists.map(userList => deleteUserListMembershipInDatabase(deps.db, user.id, userList.id)));
}

async function packHonoApiBlocking(
	deps: HonoApiAccountBlockingDependencies,
	blocking: MiBlocking,
	me: { id: MiUser['id'] },
): Promise<HonoApiBlockingResponse> {
	const blockee = blocking.blockee ?? await fetchUserByIdOrFailFromDatabase(deps.db, blocking.blockeeId);

	return {
		id: blocking.id,
		createdAt: parseId(deps.config, blocking.id).date.toISOString(),
		blockeeId: blocking.blockeeId,
		blockee: await packUserDetailedNotMeForHonoApi(deps, blockee, me),
	};
}

export async function deliverBlockActivity(
	deps: HonoApiAccountBlockingDependencies,
	blocking: MiBlocking & { blocker: MiUser; blockee: MiUser },
): Promise<void> {
	if (!isLocalUser(blocking.blocker) || !isRemoteUser(blocking.blockee)) return;

	const content = addActivityContext(deps.config, renderBlock(deps.config, blocking));
	enqueueDeliverJob(deps.deliverQueue, deps.config, blocking.blocker, content as IActivity, blocking.blockee.inbox, false);
}

export async function deliverUndoBlockActivity(
	deps: HonoApiAccountBlockingDependencies,
	blocking: MiBlocking & { blocker: MiUser; blockee: MiUser },
): Promise<void> {
	if (!isLocalUser(blocking.blocker) || !isRemoteUser(blocking.blockee)) return;

	const block = renderBlock(deps.config, blocking);
	const content = addActivityContext(deps.config, renderUndo(deps.config, block, blocking.blocker));
	enqueueDeliverJob(deps.deliverQueue, deps.config, blocking.blocker, content as IActivity, blocking.blockee.inbox, false);
}

/** UserBlockingService.block 相当。ガード (自分自身・二重ブロック) は呼び出し側の責務。 */
export async function blockForHonoApi(
	deps: HonoApiAccountBlockingDependencies,
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

	const blocking = await createBlockingInDatabase(deps.db, {
		id: genId(deps.config),
		blockerId: blocker.id,
		blockeeId: blockee.id,
	}) as MiBlocking & { blocker: MiUser; blockee: MiUser };
	blocking.blocker = blocker;
	blocking.blockee = blockee;

	await Promise.all([
		refreshUserBlockingCache(deps, blocker.id),
		refreshUserBlockedCache(deps, blockee.id),
	]);
	deps.publishInternalEvent?.('blockingCreated', { blockerId: blocker.id, blockeeId: blockee.id });
	await deliverBlockActivity(deps, blocking);

	return blocking;
}

export async function handleHonoApiBlockingCreate(
	deps: HonoApiAccountBlockingDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<UserDetailedNotMeHonoApiResponse> {
	const params = parseHonoApiParams(userIdParamDef, body);
	const blocker = await fetchUserByIdOrFailFromDatabase(deps.db, me.id);

	if (blocker.id === params.userId) {
		throw clientError('Blockee is yourself.', 'BLOCKEE_IS_YOURSELF', '88b19138-f28d-42c0-8499-6a31bbd0fdc6');
	}

	const blockee = await getTargetUserOrThrow(deps, params.userId, blockingCreateNoSuchUserError);
	if (await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(deps.db, blocker.id, blockee.id) != null) {
		throw clientError('You are already blocking that user.', 'ALREADY_BLOCKING', '787fed64-acb9-464a-82eb-afbd745b9614');
	}

	const blocking = await blockForHonoApi(deps, blocker, blockee);

	return await packUserDetailedNotMeForHonoApi(deps, blocking.blockee, blocking.blocker);
}

/** UserBlockingService.unblock 相当。ブロック行が存在しない場合は何もしない。 */
export async function unblockForHonoApi(
	deps: HonoApiAccountBlockingDependencies,
	blocker: MiUser,
	blockee: MiUser,
): Promise<void> {
	const blocking = await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(deps.db, blocker.id, blockee.id);
	if (blocking == null) return;

	blocking.blocker = blocker;
	blocking.blockee = blockee;

	await deleteBlockingByIdFromDatabase(deps.db, blocking.id);
	await Promise.all([
		refreshUserBlockingCache(deps, blocker.id),
		refreshUserBlockedCache(deps, blockee.id),
	]);
	deps.publishInternalEvent?.('blockingDeleted', { blockerId: blocker.id, blockeeId: blockee.id });
	await deliverUndoBlockActivity(deps, blocking as MiBlocking & { blocker: MiUser; blockee: MiUser });
}

export async function handleHonoApiBlockingDelete(
	deps: HonoApiAccountBlockingDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<UserDetailedNotMeHonoApiResponse> {
	const params = parseHonoApiParams(userIdParamDef, body);
	const blocker = await fetchUserByIdOrFailFromDatabase(deps.db, me.id);

	if (blocker.id === params.userId) {
		throw clientError('Blockee is yourself.', 'BLOCKEE_IS_YOURSELF', '06f6fac6-524b-473c-a354-e97a40ae6eac');
	}

	const blockee = await getTargetUserOrThrow(deps, params.userId, blockingDeleteNoSuchUserError);
	const existing = await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(deps.db, blocker.id, blockee.id);
	if (existing == null) {
		throw clientError('You are not blocking that user.', 'NOT_BLOCKING', '291b2efa-60c6-45c0-9f6a-045c8f9b02cd');
	}

	await unblockForHonoApi(deps, blocker, blockee);

	return await packUserDetailedNotMeForHonoApi(deps, blockee, blocker);
}

export async function handleHonoApiBlockingList(
	deps: HonoApiAccountBlockingDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Blocking'>[]> {
	const params = parseHonoApiParams(blockingListParamDef, body);
	const blockings = await listBlockingsByBlockerIdWithPaginationFromDatabase(deps.db, me.id, {
		...resolveBlockingPagination({
			gen: time => genId(deps.config, time),
		}, params),
		limit: params.limit,
	});

	return await Promise.all(blockings.map(blocking => packHonoApiBlocking(deps, blocking, me) as Promise<Packed<'Blocking'>>));
}
