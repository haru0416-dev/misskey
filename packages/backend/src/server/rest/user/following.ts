/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { toPunyNullable } from '@/misc/to-puny.js';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { omitUndefined } from '@/misc/clone.js';
import type * as Redis from 'ioredis';
import { enqueueDeliverJob } from '@/core/queue/DeliverQueue.js';
import { blockingExistsInDatabase } from '@/core/user/BlockingStore.js';
import {
	createFollowRequestInDatabase,
	deleteFollowRequestByIdFromDatabase,
	deleteFollowRequestFromDatabase,
	fetchFollowRequestFromDatabase,
	followRequestExistsInDatabase,
	listAllFollowRequestsByFolloweeIdFromDatabase,
	listFollowRequestsByFolloweeIdFromDatabase,
	listFollowRequestsByFollowerIdFromDatabase,
} from '@/core/user/FollowRequestStore.js';
import type { FollowRequestRow } from '@/db/schema/follow-request.js';
import {
	countNonMovedFolloweesByFollowerIdFromDatabase,
	countNonMovedFollowersByFolloweeIdFromDatabase,
	createFollowingInDatabase,
	deleteFollowingAndUpdateUserCountsByIdInDatabase,
	fetchFollowingByFollowerIdAndFolloweeIdFromDatabase,
	followingExistsInDatabase,
	listFolloweeIdsWithRepliesByFollowerIdFromDatabase,
	listFollowersByFolloweeIdWithPaginationFromDatabase,
	listFollowingsByFollowerIdAndBirthdayWithPaginationFromDatabase,
	listFollowingsByFollowerIdWithPaginationFromDatabase,
	updateFollowingByIdInDatabase,
	updateFollowingsByFollowerIdInDatabase,
} from '@/core/user/FollowingStore.js';
import {
	adjustInstanceFollowersCountFromDatabase,
	adjustInstanceFollowingCountFromDatabase,
} from '@/core/instance/InstanceStore.js';
import { mutingExistsInDatabase } from '@/core/user/MutingStore.js';
import type { DeliverQueue, UserWebhookDeliverQueue } from '@/core/queue/queues.js';
import {
	adjustUserFollowersCountInDatabase,
	adjustUserFollowingCountInDatabase,
	fetchUserByIdFromDatabase,
	fetchUserByIdOrFailFromDatabase,
	fetchUserByUsernameAndHostFromDatabase,
	listUsersByIdsFromDatabase,
	updateUserInDatabase,
} from '@/core/user/UserStore.js';
import {
	fetchUserProfileByUserIdOrFailFromDatabase,
	listFollowingUsersByBirthdayDateFromDatabase,
} from '@/core/user/UserProfileStore.js';
import { isApiModerator } from '../role/role-policy.js';
import { fetchOrRegisterFederatedInstance } from '../activitypub/federation.js';
import { userListMembershipExistsInDatabase } from '@/core/user/UserListMembershipStore.js';
import { listWebhooksFromDatabase } from '@/core/webhook/WebhookStore.js';
import { CONTEXT } from '@/core/activitypub/misc/contexts.js';
import type { IAccept, IActivity, IFollow, IObject, IReject, IUndo } from '@/core/activitypub/type.js';
import type { Config } from '@/config.js';
import { queueRetentionOptions } from '@/queue/const.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import { promiseLimit } from '@/misc/promise-limit.js';
import { trackPromise } from '@/misc/promise-tracker.js';
import type { MiFollowing } from '@/models/Following.js';
import type { MiMeta } from '@/models/_.js';
import { birthdaySchema } from '@/models/User.js';
import type { MiLocalUser } from '@/models/User.js';
import type { MiUser } from '@/models/User.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import type { UserWebhookDeliverJobData } from '@/queue/types.js';
import { ApiError, clientError } from '../error.js';
import type { ApiInternalEventPublisher, ApiMainStreamPublisher } from '../events.js';
import { xaddApiNotification } from '../notification/notification.js';
import {
	packMeDetailedForApi,
	packUserDetailedNotMeForApi,
	packUserDetailedNotMeManyForApi,
	packUserLiteForApi,
	packUserLiteManyForApi,
	resolveAlsoKnownAsForApi,
	type UserDetailedNotMeApiResponse,
	type UserPackingDependencies,
} from './user.js';
import { parseApiParams } from '../validation.js';

export type ApiFollowingDependencies = UserPackingDependencies & {
	config: Config;
	db: MiDrizzleDatabase;
	deliverQueue: DeliverQueue;
	meta: MiMeta;
	redis: Redis.Redis;
	userWebhookDeliverQueue: UserWebhookDeliverQueue;
	publishInternalEvent?: ApiInternalEventPublisher;
	publishMainStream?: ApiMainStreamPublisher;
};

const ACCEPT_FOLLOW_REQUEST_CONCURRENCY = 8;

export const followingCreateParamDef = z.object({
	userId: misskeyId(),
	withReplies: z.boolean().optional(),
});

export const followingUserIdParamDef = z.object({
	userId: misskeyId(),
});

export const followingUpdateParamDef = z.object({
	userId: misskeyId(),
	notify: z.enum(['normal', 'none']).optional(),
	withReplies: z.boolean().optional(),
});

export const followingUpdateAllParamDef = z.object({
	notify: z.enum(['normal', 'none']).optional(),
	withReplies: z.boolean().optional(),
});

export const followingRequestsListParamDef = z.object({
	...paginationParams,
	limit: z.int().min(1).max(100).default(10),
});

export const followingListParamDef = z.object({
	notification: z.boolean().default(false),
	...paginationParams,
	limit: z.int().min(1).max(100).default(10),
});

export type FollowingListItem = {
	id: string;
	createdAt: string;
	followeeId: string;
	followerId: string;
	followee: UserDetailedNotMeApiResponse;
};

type FollowingNotificationType = 'follow' | 'receiveFollowRequest' | 'followRequestAccepted';

type FollowingNotification = {
	id: string;
	createdAt: string;
	type: FollowingNotificationType;
	notifierId: MiUser['id'];
	message?: string | null;
};

function followingCreateNoSuchUserError(): ApiError {
	return clientError('No such user.', 'NO_SUCH_USER', 'fcd2eef9-a9b2-4c4f-8624-038099e90aa5');
}

function followingDeleteNoSuchUserError(): ApiError {
	return clientError('No such user.', 'NO_SUCH_USER', '5b12c78d-2b28-4dca-99d2-f56139b42ff8');
}

function followingUpdateNoSuchUserError(): ApiError {
	return clientError('No such user.', 'NO_SUCH_USER', '14318698-f67e-492a-99da-5353a5ac52be');
}

function followingDeleteFolloweeIsYourselfError(): ApiError {
	return clientError('Followee is yourself.', 'FOLLOWEE_IS_YOURSELF', 'd9e400b9-36b0-4808-b1d8-79e707f1296c');
}

function followingDeleteNotFollowingError(): ApiError {
	return clientError('You are not following that user.', 'NOT_FOLLOWING', '5dbf82f5-c92b-40b1-87d1-6c8c0741fd09');
}

function followingUpdateFolloweeIsYourselfError(): ApiError {
	return clientError('Followee is yourself.', 'FOLLOWEE_IS_YOURSELF', '4c4cbaf9-962a-463b-8418-a5e365dbf2eb');
}

function followingUpdateNotFollowingError(): ApiError {
	return clientError('You are not following that user.', 'NOT_FOLLOWING', 'b8dc75cf-1cb5-46c9-b14b-5f1ffbd782c9');
}

function followingInvalidateNoSuchUserError(): ApiError {
	return clientError('No such user.', 'NO_SUCH_USER', 'b77e6ae6-a3e5-40da-9cc8-c240115479cc');
}

function followingInvalidateFollowerIsYourselfError(): ApiError {
	return clientError('Follower is yourself.', 'FOLLOWER_IS_YOURSELF', '07dc03b9-03da-422d-885b-438313707662');
}

function followingInvalidateNotFollowingError(): ApiError {
	return clientError('The other use is not following you.', 'NOT_FOLLOWING', '918faac3-074f-41ae-9c43-ed5d2946770d');
}

function followingRequestsAcceptNoSuchUserError(): ApiError {
	return clientError('No such user.', 'NO_SUCH_USER', '66ce1645-d66c-46bb-8b79-96739af885bd');
}

function followingRequestsAcceptNoFollowRequestError(): ApiError {
	return clientError('No follow request.', 'NO_FOLLOW_REQUEST', 'bcde4f8b-0913-4614-8881-614e522fb041');
}

function followingRequestsCancelNoSuchUserError(): ApiError {
	return clientError('No such user.', 'NO_SUCH_USER', '4e68c551-fc4c-4e46-bb41-7d4a37bf9dab');
}

function followingRequestsCancelFollowRequestNotFoundError(): ApiError {
	return clientError('Follow request not found.', 'FOLLOW_REQUEST_NOT_FOUND', '089b125b-d338-482a-9a09-e2622ac9f8d4');
}

function followingRequestsRejectNoSuchUserError(): ApiError {
	return clientError('No such user.', 'NO_SUCH_USER', 'abc2ffa6-25b2-4380-ba99-321ff3a94555');
}

export function isLocalUser(user: MiUser): user is MiUser & { host: null } {
	return user.host === null;
}

export function isRemoteUser(user: MiUser): user is MiUser & { host: string; uri: string; inbox: string } {
	return user.host !== null;
}

export function genLocalUserUri(config: Pick<Config, 'instance'>, userId: MiUser['id']): string {
	return `${config.instance.url}/users/${userId}`;
}

export function getUserUri(config: Config, user: MiUser): string {
	return isRemoteUser(user) ? user.uri : genLocalUserUri(config, user.id);
}

export function renderFollow(config: Config, follower: MiUser, followee: MiUser, requestId?: string | null): IFollow {
	return {
		id: requestId ?? `${config.instance.url}/follows/${follower.id}/${followee.id}`,
		type: 'Follow',
		actor: getUserUri(config, follower),
		object: getUserUri(config, followee),
	};
}

export function renderUndo(config: Config, object: string | IObject, user: { id: MiUser['id'] }): IUndo {
	const id =
		typeof object !== 'string' && typeof object.id === 'string' && object.id.startsWith(config.instance.url)
			? `${object.id}/undo`
			: undefined;

	return {
		type: 'Undo',
		...(id ? { id } : {}),
		actor: genLocalUserUri(config, user.id),
		object,
		published: new Date().toISOString(),
	};
}

export function renderReject(config: Config, object: string | IObject, user: { id: MiUser['id'] }): IReject {
	return {
		type: 'Reject',
		actor: genLocalUserUri(config, user.id),
		object,
	};
}

export function renderAccept(config: Config, object: string | IObject, user: { id: MiUser['id'] }): IAccept {
	return {
		type: 'Accept',
		actor: genLocalUserUri(config, user.id),
		object,
	};
}

export function addActivityContext<T extends IObject>(
	config: Config,
	activity: T,
): T & { '@context': typeof CONTEXT; id: string } {
	if (activity.id == null) {
		activity.id = `${config.instance.url}/${randomUUID()}`;
	}

	return Object.assign({ '@context': CONTEXT }, activity as T & { id: string });
}

async function getTargetUserOrThrow(
	deps: ApiFollowingDependencies,
	userId: MiUser['id'],
	errorFactory: () => ApiError = followingCreateNoSuchUserError,
): Promise<MiUser> {
	const user = await fetchUserByIdFromDatabase(deps.db, userId);
	if (user == null) throw errorFactory();

	return user;
}

async function isNotificationAllowed(
	deps: ApiFollowingDependencies,
	notifieeId: MiUser['id'],
	type: FollowingNotificationType,
	notifierId: MiUser['id'],
): Promise<boolean> {
	if (notifieeId === notifierId) return false;

	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, notifieeId);
	const receiveConfig = (profile.notificationRecieveConfig ?? {})[type];
	if (receiveConfig?.type === 'never') return false;

	if (await mutingExistsInDatabase(deps.db, notifieeId, notifierId)) return false;

	switch (receiveConfig?.type) {
		case 'following':
			return await followingExistsInDatabase(deps.db, notifieeId, notifierId);
		case 'follower':
			return await followingExistsInDatabase(deps.db, notifierId, notifieeId);
		case 'mutualFollow': {
			const [isFollowing, isFollower] = await Promise.all([
				followingExistsInDatabase(deps.db, notifieeId, notifierId),
				followingExistsInDatabase(deps.db, notifierId, notifieeId),
			]);
			return isFollowing && isFollower;
		}
		case 'followingOrFollower': {
			const [isFollowing, isFollower] = await Promise.all([
				followingExistsInDatabase(deps.db, notifieeId, notifierId),
				followingExistsInDatabase(deps.db, notifierId, notifieeId),
			]);
			return isFollowing || isFollower;
		}
		case 'list':
			return await userListMembershipExistsInDatabase(deps.db, notifierId, receiveConfig.userListId);
		default:
			return true;
	}
}

async function createFollowingNotification(
	deps: ApiFollowingDependencies,
	notifieeId: MiUser['id'],
	type: FollowingNotificationType,
	notifier: MiUser,
	options: {
		message?: string | null;
	} = {},
): Promise<void> {
	if (!(await isNotificationAllowed(deps, notifieeId, type, notifier.id))) return;

	const notification: FollowingNotification = {
		id: genId(),
		createdAt: new Date().toISOString(),
		type,
		notifierId: notifier.id,
		...(type === 'followRequestAccepted' ? { message: options.message ?? null } : {}),
	};
	const redisId = await xaddApiNotification(deps, notifieeId, notification);
	const packed = {
		id: notification.id,
		createdAt: notification.createdAt,
		type: notification.type,
		userId: notifier.id,
		user: await packUserLiteForApi(deps, notifier),
		...(notification.type === 'followRequestAccepted' ? { message: notification.message ?? null } : {}),
	};

	deps.publishMainStream?.(notifieeId, 'notification', packed);
	trackPromise(
		delay(2000, undefined, { ref: false })
			.then(async () => {
				const latestReadNotificationId = await deps.redis.get(`latestReadNotification:${notifieeId}`);
				if (latestReadNotificationId && latestReadNotificationId >= redisId) return;
				deps.publishMainStream?.(notifieeId, 'unreadNotification', packed);
			})
			.catch(() => {}),
	);
}

/** follow 系 webhook / mainStream 通知だけに必要な最小 deps (blocking 経路からも共有される)。 */
export type FollowEventPublishDependencies = UserPackingDependencies & {
	config: Config;
	db: MiDrizzleDatabase;
	userWebhookDeliverQueue: UserWebhookDeliverQueue;
	publishMainStream?: ApiMainStreamPublisher;
};

async function enqueueUserWebhook(
	deps: FollowEventPublishDependencies,
	userId: MiUser['id'],
	type: 'follow' | 'followed' | 'unfollow',
	user: Packed<'UserDetailedNotMe'> | Packed<'UserLite'>,
): Promise<void> {
	const webhooks = await listWebhooksFromDatabase(deps.db, {
		userId,
		isActive: true,
		on: [type],
	});

	await Promise.all(
		webhooks.map((webhook) => {
			const data: UserWebhookDeliverJobData = {
				type,
				content: { user } as UserWebhookDeliverJobData['content'],
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
				...queueRetentionOptions(deps.config),
			});
		}),
	);
}

async function publishFollowToLocalFollower(
	deps: ApiFollowingDependencies,
	follower: MiUser,
	followee: MiUser,
): Promise<void> {
	if (!isLocalUser(follower)) return;

	const packedFollowee = (await packUserDetailedNotMeForApi(deps, followee, follower)) as Packed<'UserDetailedNotMe'>;
	deps.publishMainStream?.(follower.id, 'follow', packedFollowee);
	await enqueueUserWebhook(deps, follower.id, 'follow', packedFollowee);
}

async function publishFollowedToLocalFollowee(
	deps: ApiFollowingDependencies,
	followee: MiUser,
	follower: MiUser,
	awaitNotification = false,
): Promise<void> {
	if (!isLocalUser(followee)) return;

	const packedFollower = await packUserLiteForApi(deps, follower);
	deps.publishMainStream?.(followee.id, 'followed', packedFollower);
	await enqueueUserWebhook(deps, followee.id, 'followed', packedFollower);
	const notification = createFollowingNotification(deps, followee.id, 'follow', follower);
	if (awaitNotification) {
		await notification.catch(() => {});
	} else {
		trackPromise(notification);
	}
}

export async function publishUnfollowToLocalFollower(
	deps: FollowEventPublishDependencies,
	follower: MiUser,
	followee: MiUser,
): Promise<void> {
	if (!isLocalUser(follower)) return;

	const packedFollowee = (await packUserDetailedNotMeForApi(deps, followee, follower)) as Packed<'UserDetailedNotMe'>;
	deps.publishMainStream?.(follower.id, 'unfollow', packedFollowee);
	await enqueueUserWebhook(deps, follower.id, 'unfollow', packedFollowee);
}

async function deliverFollowActivity(
	deps: ApiFollowingDependencies,
	follower: MiUser,
	followee: MiUser,
	requestId?: string | null,
): Promise<void> {
	if (!isLocalUser(follower) || !isRemoteUser(followee)) return;

	const content = addActivityContext(deps.config, renderFollow(deps.config, follower, followee, requestId));
	enqueueDeliverJob(deps.deliverQueue, deps.config, follower, content as IActivity, followee.inbox, false);
}

export async function createFollowRequestWithSideEffects(
	deps: ApiFollowingDependencies,
	follower: MiUser,
	followee: MiUser,
	withReplies?: boolean,
	requestId?: string,
): Promise<void> {
	await deleteFollowRequestFromDatabase(deps.db, follower.id, followee.id);

	const followRequest = await createFollowRequestInDatabase(deps.db, {
		id: genId(),
		followerId: follower.id,
		followeeId: followee.id,
		withReplies,
		requestId,
		followerHost: follower.host,
		followerInbox: isRemoteUser(follower) ? follower.inbox : undefined,
		followerSharedInbox: isRemoteUser(follower) ? follower.sharedInbox : undefined,
		followeeHost: followee.host,
		followeeInbox: isRemoteUser(followee) ? followee.inbox : undefined,
		followeeSharedInbox: isRemoteUser(followee) ? followee.sharedInbox : undefined,
	});

	if (isLocalUser(followee)) {
		const packedFollower = await packUserLiteForApi(deps, follower);
		deps.publishMainStream?.(followee.id, 'receiveFollowRequest', packedFollower);
		deps.publishMainStream?.(
			followee.id,
			'meUpdated',
			await packMeDetailedForApi(deps, followee, {
				includeSecrets: false,
			}),
		);
		trackPromise(createFollowingNotification(deps, followee.id, 'receiveFollowRequest', follower));
	}

	if (isLocalUser(follower) && isRemoteUser(followee)) {
		await deliverFollowActivity(
			deps,
			follower,
			followee,
			requestId ?? `${deps.config.instance.url}/follows/${followRequest.id}`,
		);
	}
}

async function incrementFollowing(
	deps: ApiFollowingDependencies,
	follower: MiUser,
	followee: MiUser,
	withReplies: MiFollowing['withReplies'],
): Promise<void> {
	deps.publishInternalEvent?.('follow', { followerId: follower.id, followeeId: followee.id, withReplies });

	if (!follower.movedToUri && !followee.movedToUri) {
		await Promise.all([
			adjustUserFollowingCountInDatabase(deps.db, follower.id, 1),
			adjustUserFollowersCountInDatabase(deps.db, followee.id, 1),
		]);

		if (deps.meta.enableStatsForFederatedInstances && isLocalUser(follower) && isRemoteUser(followee)) {
			const instance = await fetchOrRegisterFederatedInstance(deps, followee.host);
			await adjustInstanceFollowersCountFromDatabase(deps.db, instance.id, 1);
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

async function decrementFollowing(deps: ApiFollowingDependencies, follower: MiUser, followee: MiUser): Promise<void> {
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

async function deleteFollowingWithSideEffects(
	deps: ApiFollowingDependencies,
	follower: MiUser,
	followee: MiUser,
	followingId: string,
): Promise<boolean> {
	const deleted = await deleteFollowingAndUpdateUserCountsByIdInDatabase(
		deps.db,
		followingId,
		follower.id,
		followee.id,
	);
	if (!deleted) return false;

	await decrementFollowing(deps, follower, followee);
	await publishUnfollowToLocalFollower(deps, follower, followee);

	if (isLocalUser(follower) && isRemoteUser(followee)) {
		const content = addActivityContext(
			deps.config,
			renderUndo(deps.config, renderFollow(deps.config, follower, followee), follower),
		);
		enqueueDeliverJob(deps.deliverQueue, deps.config, follower, content as IActivity, followee.inbox, false);
	}

	if (isLocalUser(followee) && isRemoteUser(follower)) {
		const content = addActivityContext(
			deps.config,
			renderReject(deps.config, renderFollow(deps.config, follower, followee), followee),
		);
		enqueueDeliverJob(deps.deliverQueue, deps.config, followee, content as IActivity, follower.inbox, false);
	}

	return true;
}

export async function insertFollowingWithSideEffects(
	deps: ApiFollowingDependencies,
	follower: MiUser,
	followee: MiUser,
	options: {
		withReplies?: boolean;
		followeeProfile: MiUserProfile;
		silent?: boolean;
		awaitNotification?: boolean;
	},
): Promise<void> {
	await createFollowingInDatabase(deps.db, {
		id: genId(),
		followerId: follower.id,
		followeeId: followee.id,
		withReplies: options.withReplies,
		followerHost: follower.host,
		followerInbox: isRemoteUser(follower) ? follower.inbox : null,
		followerSharedInbox: isRemoteUser(follower) ? follower.sharedInbox : null,
		followeeHost: followee.host,
		followeeInbox: isRemoteUser(followee) ? followee.inbox : null,
		followeeSharedInbox: isRemoteUser(followee) ? followee.sharedInbox : null,
	});

	const requestExists = await followRequestExistsInDatabase(deps.db, follower.id, followee.id);
	if (requestExists) {
		await deleteFollowRequestFromDatabase(deps.db, follower.id, followee.id);
		if (isLocalUser(follower)) {
			const notification = createFollowingNotification(deps, follower.id, 'followRequestAccepted', followee, {
				message: options.followeeProfile.followedMessage,
			});
			if (options.awaitNotification) {
				await notification.catch(() => {});
			} else {
				trackPromise(notification);
			}
		}
	}

	await incrementFollowing(deps, follower, followee, options.withReplies ?? false);
	await Promise.all([
		options.silent ? Promise.resolve() : publishFollowToLocalFollower(deps, follower, followee),
		publishFollowedToLocalFollowee(deps, followee, follower, options.awaitNotification),
	]);
}

// 移行前に承認済みのフォローは、移行後の鍵アカウントでも自動承認する。
// この経路へ到達する follower はローカルユーザーに限られるため、AP 再取得は不要。
async function checkAutoAcceptIfMovedForApi(
	deps: ApiFollowingDependencies,
	follower: MiUser,
	followee: MiUser,
): Promise<boolean> {
	const oldSelfIds = await resolveAlsoKnownAsForApi(deps, follower.alsoKnownAs);
	if (!oldSelfIds || oldSelfIds.length === 0) return false;

	const followerUri = getUserUri(deps.config, follower);
	const oldSelfs = await listUsersByIdsFromDatabase(deps.db, oldSelfIds, { includeSuspended: true });

	for (const oldSelf of oldSelfs) {
		if (oldSelf.movedToUri !== followerUri) continue;
		if (await followingExistsInDatabase(deps.db, oldSelf.id, followee.id)) return true;
	}

	return false;
}

export async function handleApiFollowingCreate(
	deps: ApiFollowingDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'UserLite'>> {
	const params = parseApiParams(followingCreateParamDef, body);
	const follower = await getTargetUserOrThrow(deps, me.id);

	if (follower.id === params.userId) {
		throw clientError('Followee is yourself.', 'FOLLOWEE_IS_YOURSELF', '26fbe7bb-a331-4857-af17-205b426669a9');
	}

	const followee = await getTargetUserOrThrow(deps, params.userId);
	const [blocking, blocked] = await Promise.all([
		blockingExistsInDatabase(deps.db, follower.id, followee.id),
		blockingExistsInDatabase(deps.db, followee.id, follower.id),
	]);

	if (blocking) throw clientError('You are blocking that user.', 'BLOCKING', '4e2206ec-aa4f-4960-b865-6c23ac38e2d9');
	if (blocked) throw clientError('You are blocked by that user.', 'BLOCKED', 'c4ab57cc-4e41-45e9-bfd9-584f61e35ce0');

	if (await followingExistsInDatabase(deps.db, follower.id, followee.id)) {
		throw clientError(
			'You are already following that user.',
			'ALREADY_FOLLOWING',
			'35387507-38c7-4cb9-9197-300b93783fa0',
		);
	}

	const followeeProfile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, followee.id);
	const shouldCreateRequest =
		followee.isLocked ||
		(followeeProfile.carefulBot && follower.isBot) ||
		(isLocalUser(follower) && isRemoteUser(followee) && process.env['FORCE_FOLLOW_REMOTE_USER_FOR_TESTING'] !== 'true');

	if (shouldCreateRequest) {
		let autoAccept = false;
		if (isLocalUser(followee) && followeeProfile.autoAcceptFollowed) {
			autoAccept = await followingExistsInDatabase(deps.db, followee.id, follower.id);
		}

		if (!autoAccept && followee.isLocked) {
			autoAccept = await checkAutoAcceptIfMovedForApi(deps, follower, followee);
		}

		if (!autoAccept) {
			await createFollowRequestWithSideEffects(deps, follower, followee, params.withReplies);
			return await packUserLiteForApi(deps, followee);
		}
	}

	await insertFollowingWithSideEffects(
		deps,
		follower,
		followee,
		omitUndefined({
			withReplies: params.withReplies,
			followeeProfile,
		}),
	);

	return await packUserLiteForApi(deps, followee);
}

export async function handleApiFollowingUpdateAll(
	deps: ApiFollowingDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(followingUpdateAllParamDef, body);
	await updateFollowingsByFollowerIdInDatabase(
		deps.db,
		me.id,
		omitUndefined({
			notify: params.notify != null ? (params.notify === 'none' ? null : params.notify) : undefined,
			withReplies: params.withReplies ?? undefined,
		}),
	);
	if (params.withReplies != null) {
		deps.publishInternalEvent?.('followingsUpdated', { followerId: me.id, withReplies: params.withReplies });
	}
}

export async function handleApiFollowingDelete(
	deps: ApiFollowingDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'UserLite'>> {
	const params = parseApiParams(followingUserIdParamDef, body);
	const follower = me;

	if (me.id === params.userId) {
		throw followingDeleteFolloweeIsYourselfError();
	}

	const followee = await getTargetUserOrThrow(deps, params.userId, followingDeleteNoSuchUserError);

	const following = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(deps.db, follower.id, followee.id);
	if (following == null) {
		throw followingDeleteNotFollowingError();
	}

	if (!(await deleteFollowingWithSideEffects(deps, follower, followee, following.id))) {
		throw followingDeleteNotFollowingError();
	}

	return await packUserLiteForApi(deps, followee);
}

export async function handleApiFollowingUpdate(
	deps: ApiFollowingDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'UserLite'>> {
	const params = parseApiParams(followingUpdateParamDef, body);
	const follower = me;

	if (me.id === params.userId) {
		throw followingUpdateFolloweeIsYourselfError();
	}

	const followee = await getTargetUserOrThrow(deps, params.userId, followingUpdateNoSuchUserError);

	const exist = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(deps.db, follower.id, followee.id);
	if (exist == null) {
		throw followingUpdateNotFollowingError();
	}

	await updateFollowingByIdInDatabase(
		deps.db,
		exist.id,
		omitUndefined({
			notify: params.notify != null ? (params.notify === 'none' ? null : params.notify) : undefined,
			withReplies: params.withReplies ?? undefined,
		}),
	);
	if (params.withReplies != null) {
		deps.publishInternalEvent?.('followingUpdated', {
			followerId: me.id,
			followeeId: followee.id,
			withReplies: params.withReplies,
		});
	}

	return await packUserLiteForApi(deps, follower);
}

export async function handleApiFollowingInvalidate(
	deps: ApiFollowingDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'UserLite'>> {
	const params = parseApiParams(followingUserIdParamDef, body);
	const followee = me;

	if (me.id === params.userId) {
		throw followingInvalidateFollowerIsYourselfError();
	}

	const follower = await getTargetUserOrThrow(deps, params.userId, followingInvalidateNoSuchUserError);

	const following = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(deps.db, follower.id, followee.id);
	if (following == null) {
		throw followingInvalidateNotFollowingError();
	}

	if (!(await deleteFollowingWithSideEffects(deps, follower, followee, following.id))) {
		throw followingInvalidateNotFollowingError();
	}

	return await packUserLiteForApi(deps, follower);
}

/** フォローリクエストが存在しない場合は例外を投げる。 */
export async function acceptFollowRequestForApi(
	deps: ApiFollowingDependencies,
	followee: MiUser,
	follower: MiUser,
): Promise<void> {
	const request = await fetchFollowRequestFromDatabase(deps.db, follower.id, followee.id);
	if (request == null) {
		throw followingRequestsAcceptNoFollowRequestError();
	}

	const followeeProfile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, followee.id);
	await insertFollowingWithSideEffects(deps, follower, followee, {
		withReplies: request.withReplies ?? undefined,
		followeeProfile,
	});

	if (isRemoteUser(follower) && isLocalUser(followee)) {
		const content = addActivityContext(
			deps.config,
			renderAccept(
				deps.config,
				renderFollow(deps.config, follower, followee, request.requestId ?? undefined),
				followee,
			),
		);
		enqueueDeliverJob(deps.deliverQueue, deps.config, followee, content as IActivity, follower.inbox, false);
	}
}

export async function handleApiFollowingRequestsAccept(
	deps: ApiFollowingDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(followingUserIdParamDef, body);
	const follower = await getTargetUserOrThrow(deps, params.userId, followingRequestsAcceptNoSuchUserError);

	await acceptFollowRequestForApi(deps, me, follower);
}

export async function acceptAllFollowRequestsForApi(
	deps: ApiFollowingDependencies,
	followee: MiLocalUser,
): Promise<void> {
	const requests = await listAllFollowRequestsByFolloweeIdFromDatabase(deps.db, followee.id);
	if (requests.length === 0) return;

	const followerIds = [...new Set(requests.map((request) => request.followerId))];
	const [followeeProfile, followers] = await Promise.all([
		fetchUserProfileByUserIdOrFailFromDatabase(deps.db, followee.id),
		listUsersByIdsFromDatabase(deps.db, followerIds, { includeSuspended: true }),
	]);
	const followerById = new Map(followers.map((follower) => [follower.id, follower]));
	const limit = promiseLimit<void>(ACCEPT_FOLLOW_REQUEST_CONCURRENCY);
	let accepted = false;

	await Promise.all(
		requests.map((request) =>
			limit(async () => {
				try {
					const currentRequest = await fetchFollowRequestFromDatabase(deps.db, request.followerId, followee.id);
					if (currentRequest == null) return;
					const follower =
						followerById.get(request.followerId) ??
						(await fetchUserByIdOrFailFromDatabase(deps.db, request.followerId));
					await insertFollowingWithSideEffects(deps, follower, followee, {
						withReplies: currentRequest.withReplies ?? undefined,
						followeeProfile,
						awaitNotification: true,
					});
					accepted = true;

					if (isRemoteUser(follower) && isLocalUser(followee)) {
						const content = addActivityContext(
							deps.config,
							renderAccept(
								deps.config,
								renderFollow(deps.config, follower, followee, currentRequest.requestId ?? undefined),
								followee,
							),
						);
						await enqueueDeliverJob(
							deps.deliverQueue,
							deps.config,
							followee,
							content as IActivity,
							follower.inbox,
							false,
						);
					}
				} catch {
					// 古い、または不正な1件で残りのリクエストの承認を止めない。
				}
			}),
		),
	);

	if (accepted) {
		const freshFollowee = await fetchUserByIdOrFailFromDatabase(deps.db, followee.id);
		deps.publishMainStream?.(
			followee.id,
			'meUpdated',
			await packMeDetailedForApi(deps, freshFollowee, { includeSecrets: false }),
		);
	}
}

export async function handleApiFollowingRequestsCancel(
	deps: ApiFollowingDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'UserLite'>> {
	const params = parseApiParams(followingUserIdParamDef, body);
	const follower = me;
	const followee = await getTargetUserOrThrow(deps, params.userId, followingRequestsCancelNoSuchUserError);

	if (isRemoteUser(followee)) {
		const content = addActivityContext(
			deps.config,
			renderUndo(deps.config, renderFollow(deps.config, follower, followee), follower),
		);
		if (isLocalUser(follower)) {
			enqueueDeliverJob(deps.deliverQueue, deps.config, follower, content as IActivity, followee.inbox, false);
		}
	}

	const requestExists = await followRequestExistsInDatabase(deps.db, follower.id, followee.id);
	if (!requestExists) {
		throw followingRequestsCancelFollowRequestNotFoundError();
	}

	await deleteFollowRequestFromDatabase(deps.db, follower.id, followee.id);

	if (isLocalUser(followee)) {
		deps.publishMainStream?.(
			followee.id,
			'meUpdated',
			await packMeDetailedForApi(deps, followee, {
				includeSecrets: false,
			}),
		);
	}

	return await packUserLiteForApi(deps, followee);
}

export async function handleApiFollowingRequestsReject(
	deps: ApiFollowingDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(followingUserIdParamDef, body);
	const followee = me;
	const follower = await getTargetUserOrThrow(deps, params.userId, followingRequestsRejectNoSuchUserError);

	const request = await fetchFollowRequestFromDatabase(deps.db, follower.id, followee.id);

	if (isRemoteUser(follower)) {
		const content = addActivityContext(
			deps.config,
			renderReject(
				deps.config,
				renderFollow(deps.config, follower, followee, request?.requestId ?? undefined),
				followee,
			),
		);
		enqueueDeliverJob(deps.deliverQueue, deps.config, followee, content as IActivity, follower.inbox, false);
	}

	if (request != null) {
		await deleteFollowRequestByIdFromDatabase(deps.db, request.id);
	}

	if (isLocalUser(follower)) {
		await publishUnfollowToLocalFollower(deps, follower, followee);
	}
}

async function packFollowRequestsForApi(
	deps: ApiFollowingDependencies,
	requests: FollowRequestRow[],
	me: MiLocalUser,
): Promise<{ id: string; follower: Packed<'UserLite'>; followee: Packed<'UserLite'> }[]> {
	const userIds = [...new Set([...requests.map((r) => r.followerId), ...requests.map((r) => r.followeeId)])];
	const packedUsers = await packUserLiteManyForApi(deps, userIds);
	const userById = new Map(packedUsers.map((user) => [user.id, user]));

	return requests.map((request) => ({
		id: request.id,
		follower: userById.get(request.followerId)!,
		followee: userById.get(request.followeeId)!,
	}));
}

export async function handleApiFollowingRequestsList(
	deps: ApiFollowingDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ id: string; follower: Packed<'UserLite'>; followee: Packed<'UserLite'> }[]> {
	const params = parseApiParams(followingRequestsListParamDef, body);
	const pagination = resolveDateIdPagination({ gen: (time) => genId(time) }, params);
	const requests = await listFollowRequestsByFolloweeIdFromDatabase(deps.db, me.id, {
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packFollowRequestsForApi(deps, requests, me);
}

export async function handleApiFollowingRequestsSent(
	deps: ApiFollowingDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ id: string; follower: Packed<'UserLite'>; followee: Packed<'UserLite'> }[]> {
	const params = parseApiParams(followingRequestsListParamDef, body);
	const pagination = resolveDateIdPagination({ gen: (time) => genId(time) }, params);
	const requests = await listFollowRequestsByFollowerIdFromDatabase(deps.db, me.id, {
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packFollowRequestsForApi(deps, requests, me);
}

export async function packFollowingsForApi(
	deps: UserPackingDependencies,
	followings: MiFollowing[],
): Promise<FollowingListItem[]> {
	const packedFollowees = await packUserDetailedNotMeManyForApi(
		deps,
		followings.map((f) => f.followee ?? f.followeeId),
	);

	return followings.map((following, index) => {
		const followee = packedFollowees[index];
		if (followee == null) throw new Error(`Packed followee is missing at index ${index}`);
		return {
			id: following.id,
			createdAt: parseId(following.id).date.toISOString(),
			followeeId: following.followeeId,
			followerId: following.followerId,
			followee,
		};
	});
}

export async function handleApiFollowingList(
	deps: ApiFollowingDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<FollowingListItem[]> {
	const params = parseApiParams(followingListParamDef, body);
	const pagination = resolveDateIdPagination({ gen: (time) => genId(time) }, params);
	const followings = await listFollowingsByFollowerIdWithPaginationFromDatabase(deps.db, me.id, {
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
		notification: params.notification,
	});

	return await packFollowingsForApi(deps, followings);
}

export type FollowerListItem = {
	id: string;
	createdAt: string;
	followeeId: string;
	followerId: string;
	follower: UserDetailedNotMeApiResponse;
};

async function packFollowersForApi(
	deps: UserPackingDependencies,
	followings: MiFollowing[],
): Promise<FollowerListItem[]> {
	const packedFollowers = await packUserDetailedNotMeManyForApi(
		deps,
		followings.map((f) => f.follower ?? f.followerId),
	);

	return followings.map((following, index) => {
		const follower = packedFollowers[index];
		if (follower == null) throw new Error(`Packed follower is missing at index ${index}`);
		return {
			id: following.id,
			createdAt: parseId(following.id).date.toISOString(),
			followeeId: following.followeeId,
			followerId: following.followerId,
			follower,
		};
	});
}

// 元 ajv 版は `usersFollowersOrFollowingParamDef.allOf[0]` (userId か username+host のどちらか必須の anyOf 部分) を
// `usersFollowingParamDef` からも参照・spread していた。Zod では anyOf を union で表現するため union 自体は
// spread できない。代わりに union の各枝 (userId 版 / username+host 版) を再利用可能な base object として定義し、
// `usersFollowingParamDef` はその base に `.extend({ birthday })` して組み立てる。
const usersPaginationShape = {
	...paginationParams,
	limit: z.int().min(1).max(100).default(10),
};

// `.passthrough()` は元 ajv 版が `additionalProperties: false` を指定しておらず、
// anyOf のもう一方の枝にしか属さないプロパティ (例: userId 枝に対する username/host) も
// 素通りさせていた挙動を再現するために必要 (等価性検証スクリプトで確認済み)。
const usersByUserIdBaseParamDef = z
	.object({
		userId: misskeyId(),
		...usersPaginationShape,
	})
	.passthrough();

const usersByUsernameHostBaseParamDef = z
	.object({
		username: z.string(),
		host: z.string().nullable(),
		...usersPaginationShape,
	})
	.passthrough();

export const usersFollowersOrFollowingParamDef = z.union([usersByUserIdBaseParamDef, usersByUsernameHostBaseParamDef]);

// 月ごとの最大日数。2 月は 29 まで許す (閏日生まれの誕生日は実在するため)。
const MAX_DAY_OF_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// この絞り込みはハンドラが年を捨てて月日しか使わないので、年込みのうるう年判定はしない。
// `birthdaySchema` (z.iso.date()) をそのまま使うと平年の年で 02-29 を渡したときだけ 400 になる。
const birthdayFilterSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'must match format "date"' })
	.refine(
		(value) => {
			const [, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
			if (month == null || day == null || month < 1 || month > 12 || day < 1) return false;
			return day <= MAX_DAY_OF_MONTH[month - 1]!;
		},
		{ message: 'must be an existing month and day' },
	);

export const usersFollowingParamDef = z.union([
	usersByUserIdBaseParamDef.extend({ birthday: birthdayFilterSchema.nullable().optional() }),
	usersByUsernameHostBaseParamDef.extend({ birthday: birthdayFilterSchema.nullable().optional() }),
]);

// z.union の各枝は互いに素なプロパティ集合を持つため、推論される型では userId 版に username/host が
// (逆も同様) 存在しない扱いになり、分岐後アクセス (`params.username!` 等) が型エラーになる。
// 元 ajv 版も (allOf/anyOf からの型推論が不正確なため) 同様に手動の flat 型へ `as` キャストしていたので、
// 同じ手法を踏襲する。実行時の検証・値は z.union 側 (branch ごとの安全な検証) が担う。
type UsersFollowersOrFollowingParams = {
	userId?: string;
	username?: string;
	host?: string | null;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
	limit: number;
};

type UsersFollowingParams = UsersFollowersOrFollowingParams & {
	birthday?: string | null;
};

function usersFollowersNoSuchUserError(): ApiError {
	return clientError('No such user.', 'NO_SUCH_USER', '27fa5435-88ab-43de-9360-387de88727cd');
}
function usersFollowersForbiddenError(): ApiError {
	return clientError('Forbidden.', 'FORBIDDEN', '3c6a84db-d619-26af-ca14-06232a21df8a');
}
function usersFollowingNoSuchUserError(): ApiError {
	return clientError('No such user.', 'NO_SUCH_USER', '63e4aba4-4156-4e53-be25-c9559e42d71b');
}
function usersFollowingForbiddenError(): ApiError {
	return clientError('Forbidden.', 'FORBIDDEN', 'f6cdb0df-c19f-ec5c-7dbb-0ba84a1f92ba');
}
function usersFollowingBirthdayInvalidError(): ApiError {
	return clientError(
		'Birthday date format is invalid.',
		'BIRTHDAY_DATE_FORMAT_INVALID',
		'a2b007b9-4782-4eba-abd3-93b05ed4130d',
	);
}

export async function handleApiUsersFollowers(
	deps: ApiFollowingDependencies,
	me: MiLocalUser | null,
	body: Record<string, unknown>,
): Promise<FollowerListItem[]> {
	const params = parseApiParams(usersFollowersOrFollowingParamDef, body) as UsersFollowersOrFollowingParams;
	const user =
		params.userId != null
			? await fetchUserByIdFromDatabase(deps.db, params.userId)
			: await fetchUserByUsernameAndHostFromDatabase(deps.db, params.username!, toPunyNullable(params.host));
	if (user == null) throw usersFollowersNoSuchUserError();

	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id);

	if (profile.followersVisibility !== 'public' && !(await isApiModerator(deps, me))) {
		if (profile.followersVisibility === 'private') {
			if (me == null || me.id !== user.id) throw usersFollowersForbiddenError();
		} else if (profile.followersVisibility === 'followers') {
			if (me == null) throw usersFollowersForbiddenError();
			if (me.id !== user.id) {
				const isFollowing = await followingExistsInDatabase(deps.db, me.id, user.id);
				if (!isFollowing) throw usersFollowersForbiddenError();
			}
		}
	}

	const pagination = resolveDateIdPagination({ gen: (time) => genId(time) }, params);
	const followings = await listFollowersByFolloweeIdWithPaginationFromDatabase(deps.db, user.id, {
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packFollowersForApi(deps, followings);
}

export async function handleApiUsersFollowing(
	deps: ApiFollowingDependencies,
	me: MiLocalUser | null,
	body: Record<string, unknown>,
): Promise<FollowingListItem[]> {
	const params = parseApiParams(usersFollowingParamDef, body) as UsersFollowingParams;
	const user =
		params.userId != null
			? await fetchUserByIdFromDatabase(deps.db, params.userId)
			: await fetchUserByUsernameAndHostFromDatabase(deps.db, params.username!, toPunyNullable(params.host));
	if (user == null) throw usersFollowingNoSuchUserError();

	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id);

	if (profile.followingVisibility !== 'public' && !(await isApiModerator(deps, me))) {
		if (profile.followingVisibility === 'private') {
			if (me == null || me.id !== user.id) throw usersFollowingForbiddenError();
		} else if (profile.followingVisibility === 'followers') {
			if (me == null) throw usersFollowingForbiddenError();
			if (me.id !== user.id) {
				const isFollowing = await followingExistsInDatabase(deps.db, me.id, user.id);
				if (!isFollowing) throw usersFollowingForbiddenError();
			}
		}
	}

	const pagination = resolveDateIdPagination({ gen: (time) => genId(time) }, params);
	let followings: MiFollowing[];
	if (params.birthday) {
		try {
			const parts = params.birthday.split('-');
			parts.shift();
			const birthdayNum = Number.parseInt(parts.join(''));
			followings = await listFollowingsByFollowerIdAndBirthdayWithPaginationFromDatabase(
				deps.db,
				user.id,
				birthdayNum,
				{
					limit: params.limit,
					order: pagination.order,
					sinceId: pagination.sinceId,
					untilId: pagination.untilId,
				},
			);
		} catch {
			throw usersFollowingBirthdayInvalidError();
		}
	} else {
		followings = await listFollowingsByFollowerIdWithPaginationFromDatabase(deps.db, user.id, {
			limit: params.limit,
			order: pagination.order,
			sinceId: pagination.sinceId,
			untilId: pagination.untilId,
		});
	}

	return await packFollowingsForApi(deps, followings);
}

const birthdayMonthDaySchema = z
	.object({
		month: z.int().min(1).max(12),
		day: z.int().min(1).max(31),
	})
	// 月と日の組み合わせは JSON Schema で表現できないので、生成されるドキュメントには出ない。
	.refine(({ month, day }) => day <= MAX_DAY_OF_MONTH[month - 1]!, {
		message: 'must be an existing month and day',
	});

const birthdayRangeSchema = z.object({
	begin: birthdayMonthDaySchema,
	end: birthdayMonthDaySchema,
});

// 月日だけの指定と範囲指定は排他 (両方の形を同時に満たす入力は受け付けない)。
// z.union は anyOf 相当なので、ちょうど 1 つに一致することを要求する z.xor を使う。
export const usersGetFollowingUsersByBirthdayParamDef = z.object({
	limit: z.int().min(1).max(100).default(10),
	offset: z.int().nonnegative().default(0),
	birthday: z.xor([birthdayMonthDaySchema, birthdayRangeSchema]),
});

export async function handleApiUsersGetFollowingUsersByBirthday(
	deps: ApiFollowingDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ id: string; birthday: string; user: Packed<'UserLite'> }[]> {
	const params = parseApiParams(usersGetFollowingUsersByBirthdayParamDef, body);

	let condition: { type: 'single'; value: number } | { type: 'range'; begin: number; end: number };
	if (Object.hasOwn(params.birthday, 'begin') && Object.hasOwn(params.birthday, 'end')) {
		const range = params.birthday as { begin: { month: number; day: number }; end: { month: number; day: number } };
		const begin = range.begin.month * 100 + range.begin.day;
		const end = range.end.month * 100 + range.end.day;
		condition = { type: 'range', begin, end };
	} else {
		const { month, day } = params.birthday as { month: number; day: number };
		condition = { type: 'single', value: month * 100 + day };
	}

	const birthdayUsers = await listFollowingUsersByBirthdayDateFromDatabase(deps.db, me.id, condition, {
		offset: params.offset,
		limit: params.limit,
	});

	const users = new Map<string, Packed<'UserLite'>>(
		(
			await packUserLiteManyForApi(
				deps,
				birthdayUsers.map((u) => u.userId),
			)
		).map((u) => [u.id, u]),
	);

	return birthdayUsers
		.map((item) => {
			const birthday = new Date();
			birthday.setHours(0, 0, 0, 0);
			birthday.setMonth(Math.floor(item.birthdayDate / 100) - 1, item.birthdayDate % 100);

			if (birthday.getTime() < new Date().setHours(0, 0, 0, 0)) {
				birthday.setFullYear(new Date().getFullYear() + 1);
			}

			const birthdayStr = `${birthday.getFullYear()}-${(birthday.getMonth() + 1).toString().padStart(2, '0')}-${birthday.getDate().toString().padStart(2, '0')}`;
			return {
				id: item.userId,
				birthday: birthdayStr,
				user: users.get(item.userId),
			};
		})
		.filter((item): item is { id: string; birthday: string; user: Packed<'UserLite'> } => item.user != null);
}
