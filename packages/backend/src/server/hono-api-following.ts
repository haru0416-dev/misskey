/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { domainToASCII } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import type * as Redis from 'ioredis';
import { enqueueDeliverJob } from '@/core/DeliverQueue.js';
import { blockingExistsInDatabase } from '@/core/BlockingStore.js';
import { createFollowRequestInDatabase, deleteFollowRequestFromDatabase, followRequestExistsInDatabase } from '@/core/FollowRequestStore.js';
import { countNonMovedFolloweesByFollowerIdFromDatabase, countNonMovedFollowersByFolloweeIdFromDatabase, createFollowingInDatabase, deleteFollowingByIdInDatabase, fetchFollowingByFollowerIdAndFolloweeIdFromDatabase, followingExistsInDatabase, listFolloweeIdsWithRepliesByFollowerIdFromDatabase, updateFollowingByIdInDatabase, updateFollowingsByFollowerIdInDatabase } from '@/core/FollowingStore.js';
import { adjustInstanceFollowersCountFromDatabase, adjustInstanceFollowingCountFromDatabase, createInstanceInDatabase, fetchInstanceByHostFromDatabase } from '@/core/InstanceStore.js';
import { listMuteeIdsByMuterIdFromDatabase } from '@/core/MutingStore.js';
import type { DeliverQueue, UserWebhookDeliverQueue } from '@/core/QueueModule.js';
import { adjustUserFollowersCountInDatabase, adjustUserFollowingCountInDatabase, fetchUserByIdFromDatabase, updateUserInDatabase } from '@/core/UserStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/UserProfileStore.js';
import { userListMembershipExistsInDatabase } from '@/core/UserListMembershipStore.js';
import { listWebhooksFromDatabase } from '@/core/WebhookStore.js';
import { CONTEXT } from '@/core/activitypub/misc/contexts.js';
import type { IActivity, IFollow, IObject, IUndo } from '@/core/activitypub/type.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { trackPromise } from '@/misc/promise-tracker.js';
import type { MiInstance } from '@/models/Instance.js';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import type { MiUser } from '@/models/User.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import type { UserWebhookDeliverJobData } from '@/queue/types.js';
import { HonoApiError } from './hono-api-error.js';
import type { HonoApiInternalEventPublisher, HonoApiMainStreamPublisher } from './hono-api-events.js';
import { xaddHonoApiNotification } from './hono-api-notification.js';
import { packMeDetailedForHonoApi, packUserDetailedNotMeForHonoApi, packUserLiteForHonoApi, type UserPackingDependencies } from './hono-api-user.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiFollowingDependencies = UserPackingDependencies & {
	config: Config;
	db: MiDrizzleDatabase;
	deliverQueue: DeliverQueue;
	meta: MiMeta;
	redis: Redis.Redis;
	userWebhookDeliverQueue: UserWebhookDeliverQueue;
	publishInternalEvent?: HonoApiInternalEventPublisher;
	publishMainStream?: HonoApiMainStreamPublisher;
};

const followingCreateParamDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		withReplies: { type: 'boolean' },
	},
	required: ['userId'],
} as const;

const followingUserIdParamDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId'],
} as const;

const followingUpdateParamDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		notify: { type: 'string', enum: ['normal', 'none'] },
		withReplies: { type: 'boolean' },
	},
	required: ['userId'],
} as const;

const followingUpdateAllParamDef = {
	type: 'object',
	properties: {
		notify: { type: 'string', enum: ['normal', 'none'] },
		withReplies: { type: 'boolean' },
	},
} as const;

type FollowingCreateParams = {
	userId: string;
	withReplies?: boolean;
};

type FollowingUserIdParams = {
	userId: string;
};

type FollowingUpdateParams = {
	userId: string;
	notify?: 'normal' | 'none';
	withReplies?: boolean;
};

type FollowingUpdateAllParams = {
	notify?: 'normal' | 'none';
	withReplies?: boolean;
};

type FollowingNotificationType = 'follow' | 'receiveFollowRequest' | 'followRequestAccepted';

type FollowingNotification = {
	id: string;
	createdAt: string;
	type: FollowingNotificationType;
	notifierId: MiUser['id'];
	message?: string | null;
};

function clientError(message: string, code: string, id: string): HonoApiError {
	return new HonoApiError({
		status: 400,
		message,
		code,
		id,
	});
}

function followingCreateNoSuchUserError(): HonoApiError {
	return clientError('No such user.', 'NO_SUCH_USER', 'fcd2eef9-a9b2-4c4f-8624-038099e90aa5');
}

function followingDeleteNoSuchUserError(): HonoApiError {
	return clientError('No such user.', 'NO_SUCH_USER', '5b12c78d-2b28-4dca-99d2-f56139b42ff8');
}

function followingUpdateNoSuchUserError(): HonoApiError {
	return clientError('No such user.', 'NO_SUCH_USER', '14318698-f67e-492a-99da-5353a5ac52be');
}

function isLocalUser(user: MiUser): user is MiUser & { host: null } {
	return user.host === null;
}

function isRemoteUser(user: MiUser): user is MiUser & { host: string; uri: string; inbox: string } {
	return user.host !== null;
}

function genLocalUserUri(config: Config, userId: MiUser['id']): string {
	return `${config.url}/users/${userId}`;
}

function getUserUri(config: Config, user: MiUser): string {
	return isRemoteUser(user) ? user.uri : genLocalUserUri(config, user.id);
}

function renderFollow(config: Config, follower: MiUser, followee: MiUser, requestId?: string | null): IFollow {
	return {
		id: requestId ?? `${config.url}/follows/${follower.id}/${followee.id}`,
		type: 'Follow',
		actor: getUserUri(config, follower),
		object: getUserUri(config, followee),
	};
}

function renderUndo(config: Config, object: string | IObject, user: { id: MiUser['id'] }): IUndo {
	const id = typeof object !== 'string' && typeof object.id === 'string' && object.id.startsWith(config.url) ? `${object.id}/undo` : undefined;

	return {
		type: 'Undo',
		...(id ? { id } : {}),
		actor: genLocalUserUri(config, user.id),
		object,
		published: new Date().toISOString(),
	};
}

function addActivityContext<T extends IObject>(config: Config, activity: T): T & { '@context': typeof CONTEXT; id: string } {
	if (activity.id == null) {
		activity.id = `${config.url}/${randomUUID()}`;
	}

	return Object.assign({ '@context': CONTEXT }, activity as T & { id: string });
}

async function getTargetUserOrThrow(
	deps: HonoApiFollowingDependencies,
	userId: MiUser['id'],
	errorFactory: () => HonoApiError = followingCreateNoSuchUserError,
): Promise<MiUser> {
	const user = await fetchUserByIdFromDatabase(deps.db, userId);
	if (user == null) throw errorFactory();

	return user;
}

async function refreshUserFollowingsCache(deps: HonoApiFollowingDependencies, followerId: MiUser['id']): Promise<void> {
	const followees = await listFolloweeIdsWithRepliesByFollowerIdFromDatabase(deps.db, followerId);
	const value: Record<string, { withReplies: boolean }> = {};

	for (const followee of followees) {
		value[followee.followeeId] = { withReplies: followee.withReplies };
	}

	await deps.redis.set(`kvcache:userFollowings:${followerId}`, JSON.stringify(value), 'EX', 60 * 30);
}

async function updateFederatedInstanceCache(
	deps: HonoApiFollowingDependencies,
	instance: MiInstance,
): Promise<void> {
	await deps.redis.set(
		`kvcache:federatedInstance:${instance.host}`,
		JSON.stringify(instance),
		'EX',
		60 * 30,
	);
}

async function fetchOrRegisterFederatedInstance(
	deps: HonoApiFollowingDependencies,
	host: string,
): Promise<MiInstance> {
	const punyHost = domainToASCII(host.toLowerCase());
	const existing = await fetchInstanceByHostFromDatabase(deps.db, punyHost);
	if (existing != null) {
		await updateFederatedInstanceCache(deps, existing);
		return existing;
	}

	const created = await createInstanceInDatabase(deps.db, {
		id: genId(deps.config),
		host: punyHost,
		firstRetrievedAt: new Date(),
	});
	await updateFederatedInstanceCache(deps, created);
	return created;
}

async function isNotificationAllowed(
	deps: HonoApiFollowingDependencies,
	notifieeId: MiUser['id'],
	type: FollowingNotificationType,
	notifierId: MiUser['id'],
): Promise<boolean> {
	if (notifieeId === notifierId) return false;

	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, notifieeId);
	const recieveConfig = (profile.notificationRecieveConfig ?? {})[type];
	if (recieveConfig?.type === 'never') return false;

	const mutings = await listMuteeIdsByMuterIdFromDatabase(deps.db, notifieeId);
	if (mutings.includes(notifierId)) return false;

	switch (recieveConfig?.type) {
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
			return await userListMembershipExistsInDatabase(deps.db, notifierId, recieveConfig.userListId);
		default:
			return true;
	}
}

function createFollowingNotification(
	deps: HonoApiFollowingDependencies,
	notifieeId: MiUser['id'],
	type: FollowingNotificationType,
	notifier: MiUser,
	options: {
		message?: string | null;
	} = {},
): void {
	trackPromise((async () => {
		if (!await isNotificationAllowed(deps, notifieeId, type, notifier.id)) return;

		const notification: FollowingNotification = {
			id: genId(deps.config),
			createdAt: new Date().toISOString(),
			type,
			notifierId: notifier.id,
			...(type === 'followRequestAccepted' ? { message: options.message ?? null } : {}),
		};
		const redisId = await xaddHonoApiNotification(deps, notifieeId, notification);
		const packed = {
			id: notification.id,
			createdAt: notification.createdAt,
			type: notification.type,
			userId: notifier.id,
			user: await packUserLiteForHonoApi(deps, notifier),
			...(notification.type === 'followRequestAccepted' ? { message: notification.message ?? null } : {}),
		};

		deps.publishMainStream?.(notifieeId, 'notification', packed);
		trackPromise(delay(2000, undefined, { ref: false }).then(async () => {
			const latestReadNotificationId = await deps.redis.get(`latestReadNotification:${notifieeId}`);
			if (latestReadNotificationId && latestReadNotificationId >= redisId) return;
			deps.publishMainStream?.(notifieeId, 'unreadNotification', packed);
		}).catch(() => {}));
	})());
}

async function enqueueUserWebhook(
	deps: HonoApiFollowingDependencies,
	userId: MiUser['id'],
	type: 'follow' | 'followed',
	user: Packed<'UserDetailedNotMe'> | Packed<'UserLite'>,
): Promise<void> {
	const webhooks = (await listWebhooksFromDatabase(deps.db, {
		isActive: true,
		on: [type],
	})).filter(webhook => webhook.userId === userId && webhook.on.includes(type));

	await Promise.all(webhooks.map(webhook => {
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

async function publishFollowToLocalFollower(
	deps: HonoApiFollowingDependencies,
	follower: MiUser,
	followee: MiUser,
): Promise<void> {
	if (!isLocalUser(follower)) return;

	const packedFollowee = await packUserDetailedNotMeForHonoApi(deps, followee) as Packed<'UserDetailedNotMe'>;
	deps.publishMainStream?.(follower.id, 'follow', packedFollowee);
	await enqueueUserWebhook(deps, follower.id, 'follow', packedFollowee);
}

async function publishFollowedToLocalFollowee(
	deps: HonoApiFollowingDependencies,
	followee: MiUser,
	follower: MiUser,
): Promise<void> {
	if (!isLocalUser(followee)) return;

	const packedFollower = await packUserLiteForHonoApi(deps, follower);
	deps.publishMainStream?.(followee.id, 'followed', packedFollower);
	await enqueueUserWebhook(deps, followee.id, 'followed', packedFollower);
	createFollowingNotification(deps, followee.id, 'follow', follower);
}

async function deliverFollowActivity(
	deps: HonoApiFollowingDependencies,
	follower: MiUser,
	followee: MiUser,
	requestId?: string | null,
): Promise<void> {
	if (!isLocalUser(follower) || !isRemoteUser(followee)) return;

	const content = addActivityContext(deps.config, renderFollow(deps.config, follower, followee, requestId));
	enqueueDeliverJob(deps.deliverQueue, deps.config, follower, content as IActivity, followee.inbox, false);
}

async function createFollowRequestWithSideEffects(
	deps: HonoApiFollowingDependencies,
	follower: MiUser,
	followee: MiUser,
	withReplies?: boolean,
): Promise<void> {
	await deleteFollowRequestFromDatabase(deps.db, follower.id, followee.id);

	const followRequest = await createFollowRequestInDatabase(deps.db, {
		id: genId(deps.config),
		followerId: follower.id,
		followeeId: followee.id,
		withReplies,
		followerHost: follower.host,
		followerInbox: isRemoteUser(follower) ? follower.inbox : undefined,
		followerSharedInbox: isRemoteUser(follower) ? follower.sharedInbox : undefined,
		followeeHost: followee.host,
		followeeInbox: isRemoteUser(followee) ? followee.inbox : undefined,
		followeeSharedInbox: isRemoteUser(followee) ? followee.sharedInbox : undefined,
	});

	if (isLocalUser(followee)) {
		const packedFollower = await packUserLiteForHonoApi(deps, follower);
		deps.publishMainStream?.(followee.id, 'receiveFollowRequest', packedFollower);
		deps.publishMainStream?.(followee.id, 'meUpdated', await packMeDetailedForHonoApi(deps, followee, {
			includeSecrets: false,
		}));
		createFollowingNotification(deps, followee.id, 'receiveFollowRequest', follower);
	}

	if (isLocalUser(follower) && isRemoteUser(followee)) {
		await deliverFollowActivity(deps, follower, followee, `${deps.config.url}/follows/${followRequest.id}`);
	}
}

async function incrementFollowing(
	deps: HonoApiFollowingDependencies,
	follower: MiUser,
	followee: MiUser,
): Promise<void> {
	deps.publishInternalEvent?.('follow', { followerId: follower.id, followeeId: followee.id });

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

async function insertFollowingWithSideEffects(
	deps: HonoApiFollowingDependencies,
	follower: MiUser,
	followee: MiUser,
	options: {
		withReplies?: boolean;
		followeeProfile: MiUserProfile;
	},
): Promise<void> {
	await createFollowingInDatabase(deps.db, {
		id: genId(deps.config),
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

	await refreshUserFollowingsCache(deps, follower.id);

	const requestExists = await followRequestExistsInDatabase(deps.db, follower.id, followee.id);
	if (requestExists) {
		await deleteFollowRequestFromDatabase(deps.db, follower.id, followee.id);
		if (isLocalUser(follower)) {
			createFollowingNotification(deps, follower.id, 'followRequestAccepted', followee, {
				message: options.followeeProfile.followedMessage,
			});
		}
	}

	await incrementFollowing(deps, follower, followee);
	await Promise.all([
		publishFollowToLocalFollower(deps, follower, followee),
		publishFollowedToLocalFollowee(deps, followee, follower),
	]);
}

export async function handleHonoApiFollowingCreate(
	deps: HonoApiFollowingDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'UserLite'>> {
	const params = parseHonoApiParams(followingCreateParamDef, body) as FollowingCreateParams;
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
		throw clientError('You are already following that user.', 'ALREADY_FOLLOWING', '35387507-38c7-4cb9-9197-300b93783fa0');
	}

	const followeeProfile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, followee.id);
	const shouldCreateRequest =
		followee.isLocked ||
		(followeeProfile.carefulBot && follower.isBot) ||
		(isLocalUser(follower) && isRemoteUser(followee) && process.env.FORCE_FOLLOW_REMOTE_USER_FOR_TESTING !== 'true');

	if (shouldCreateRequest) {
		let autoAccept = false;
		if (isLocalUser(followee) && followeeProfile.autoAcceptFollowed) {
			autoAccept = await followingExistsInDatabase(deps.db, followee.id, follower.id);
		}

		if (!autoAccept) {
			await createFollowRequestWithSideEffects(deps, follower, followee, params.withReplies);
			return await packUserLiteForHonoApi(deps, followee);
		}
	}

	await insertFollowingWithSideEffects(deps, follower, followee, {
		withReplies: params.withReplies,
		followeeProfile,
	});

	return await packUserLiteForHonoApi(deps, followee);
}

export async function handleHonoApiFollowingUpdateAll(
	deps: HonoApiFollowingDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(followingUpdateAllParamDef, body) as FollowingUpdateAllParams;
	await updateFollowingsByFollowerIdInDatabase(deps.db, me.id, {
		notify: params.notify != null ? (params.notify === 'none' ? null : params.notify) : undefined,
		withReplies: params.withReplies != null ? params.withReplies : undefined,
	});
}
