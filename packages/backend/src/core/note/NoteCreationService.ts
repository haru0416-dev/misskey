/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { toPuny } from '@/misc/to-puny.js';
import * as mfm from 'mfm-js';
import type * as Redis from 'ioredis';
import { FanoutTimelinePush } from '@/server/rest/note/fanout-timeline-push.js';
import { DB_MAX_NOTE_CW_LENGTH, DB_MAX_NOTE_TEXT_LENGTH } from '@/const.js';
import { extractCustomEmojisFromMfm } from '@/misc/extract-custom-emojis-from-mfm.js';
import { extractHashtags } from '@/misc/extract-hashtags.js';
import { parseMfmCached } from '@/misc/mfm-parse-cache.js';
import { isKeywordIncluded } from '@/misc/is-keyword-included.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';
import { omitUndefined } from '@/misc/clone.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { isQuote, isRenote } from '@/misc/is-renote.js';
import { isReply } from '@/misc/is-reply.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import { concat } from '@/misc/prelude/array.js';
import type { Config } from '@/config.js';
import { queueRetentionOptions } from '@/queue/const.js';
import { runInlineDbOutboxJobs, waitForDbOutboxJob } from '@/core/queue/QueueOutboxStore.js';
import type { InlineDbOutboxJob } from '@/core/queue/QueueOutboxStore.js';
import type { NotePostProcessingReservation } from '@/core/note/NotePostProcessing.js';
import type { MiMeta } from '@/models/_.js';
import type { IPoll } from '@/models/Poll.js';
import type { IMentionedRemoteUsers, MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiChannel } from '@/models/Channel.js';
import { blockingExistsInDatabase } from '@/core/user/BlockingStore.js';
import {
	fetchChannelByIdFromDatabase,
	incrementChannelNotesCountAndUpdateLastNotedAtInDatabase,
	incrementChannelUsersCountInDatabase,
} from '@/core/channel/ChannelStore.js';
import { listFollowerUserIdsByChannelIdFromDatabase } from '@/core/channel/ChannelFollowingStore.js';
import { listDriveFilesByIdsFromDatabase } from '@/core/drive/DriveFileStore.js';
import {
	listFollowersForNoteDeliveryForRequest,
	followersForNoteDeliveryMemoKey,
	listFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabase,
	listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase,
} from '@/core/user/FollowingStore.js';
import { recordHashtagUsagesInDatabase } from '@/core/hashtag/HashtagStore.js';
import {
	adjustInstanceNotesCountFromDatabase,
	createInstanceIfNotExistsInDatabase,
	fetchInstanceByHostFromDatabase,
} from '@/core/instance/InstanceStore.js';
import {
	countNotesByUserIdAndChannelIdFromDatabase,
	createNoteWithAuthorAndInlineJobsInDatabase,
	fetchNoteByIdFromDatabase,
	fetchNotePostCreateSnapshotFromDatabase,
	incrementNoteRenoteCountInDatabase,
	incrementNoteRepliesCountInDatabase,
	listNotesByIdsFromDatabase,
} from '@/core/note/NoteStore.js';
import {
	listNoteThreadMutedUserIdsFromDatabase,
	noteThreadMutingExistsInDatabase,
} from '@/core/note/NoteThreadMutingStore.js';
import {
	listUserListIdsContainingUserFromDatabase,
	listUserListMembershipsForFanoutByUserIdFromDatabase,
} from '@/core/user/UserListMembershipStore.js';
import { listUserProfilesByUserIdsFromDatabase } from '@/core/user/UserProfileStore.js';
import {
	fetchUserByIdFromDatabase,
	fetchUserByIdOrFailFromDatabase,
	listUsersByIdsFromDatabase,
	listUsersByUsernamesAndHostsFromDatabase,
} from '@/core/user/UserStore.js';
import { listMuterIdsByMuteeIdAndMuterIdsFromDatabase } from '@/core/user/MutingStore.js';
import { listRenoteMuterIdsByMuteeIdFromDatabase } from '@/core/user/RenoteMutingStore.js';
import type { DbQueue, EndedPollNotificationQueue, UserWebhookDeliverQueue } from '@/core/queue/queues.js';
import type { DbNotePostCreateJobData, DbNotePostCreateStage, UserWebhookDeliverJobData } from '@/queue/types.js';
import { createPollInDatabase, fetchPollByNoteIdFromDatabase } from '@/core/note/PollStore.js';
import { listActiveWebhooksByUserIdAndEventFromDatabase } from '@/core/webhook/WebhookStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { addNoteToAntennasForApi } from '@/server/rest/antenna/antennas.js';
import {
	formatHashtagUsersWindow,
	getCurrentFeaturedWindow,
	HASHTAG_RANKING_WINDOW,
} from '@/server/rest/hashtag/hashtags.js';
import {
	deliverNoteActivityForApi,
	deliverToRelaysForApi,
	renderNoteOrRenoteActivityForApi,
	renderOnce,
	resolveRemoteRecipientForApi,
} from '@/server/rest/activitypub/notes-ap.js';
import type { ApiNoteApDependencies, ApiRelayDeliverDependencies } from '@/server/rest/activitypub/notes-ap.js';
import {
	createPackNoteHintsForUsersForApi,
	createPackNoteStaticHintForApi,
	packNoteForApi,
	isVisibleForMeForApi,
} from '@/server/rest/note/note.js';
import type { ApiNoteDependencies } from '@/server/rest/note/note.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiNotification } from '@/models/Notification.js';
import { getApiRolePolicies, getApiUserRoles, ROLES_VERSION_MEMO_KEY } from '@/server/rest/role/role-policy.js';
import type { ApiRolePolicyDependencies } from '@/server/rest/role/role-policy.js';
import { memoizeInRequest } from '@/misc/request-scope.js';
import { pushSwNotificationForApi } from '@/server/rest/notification/push-notification.js';
import type { ApiPushNotificationDependencies } from '@/server/rest/notification/push-notification.js';
import { packNotificationForApi } from '@/server/rest/notification/notifications-list.js';
import type { ApiNotificationsListDependencies } from '@/server/rest/notification/notifications-list.js';
import { xaddApiNotifications } from '@/server/rest/notification/notification.js';
import type { ApiNotificationDependencies } from '@/server/rest/notification/notification.js';
import { packUserLiteForApi } from '@/server/rest/user/user.js';
import type {
	ApiAntennaStreamPublisher,
	ApiMainStreamPublisher,
	ApiNotesStreamPublisher,
	ApiRoleTimelineStreamPublisher,
} from '@/server/rest/events.js';
import type { ChartWriters } from '@/server/chart-runtime.js';

export type NoteCreationDependencies = ApiNoteDependencies &
	ApiNoteApDependencies &
	ApiRelayDeliverDependencies &
	ApiRolePolicyDependencies &
	ApiNotificationDependencies & {
		config: Config;
		meta: MiMeta;
		db: MiDrizzleDatabase;
		redis: Redis.Redis;
		redisForTimelines: Redis.Redis;
		chartWriters: ChartWriters;
		userWebhookDeliverQueue: UserWebhookDeliverQueue;
		endedPollNotificationQueue: EndedPollNotificationQueue;
		dbQueue: DbQueue;
		publishNotesStream?: ApiNotesStreamPublisher;
		publishMainStream?: ApiMainStreamPublisher;
		publishAntennaStream?: ApiAntennaStreamPublisher;
		publishRoleTimelineStream?: ApiRoleTimelineStreamPublisher;
	};

function isSilencedHost(silencedHosts: string[] | undefined, host: string | null): boolean {
	if (!silencedHosts || host == null) {
		return false;
	}
	const lowerHost = host.toLowerCase();
	return silencedHosts.some((target) => `.${lowerHost}`.endsWith(`.${target}`));
}

function isMediaSilencedHost(silencedHosts: string[] | undefined, host: string | null): boolean {
	if (!silencedHosts || host == null) {
		return false;
	}
	return silencedHosts.includes(host.toLowerCase());
}

function concatNoteContentsForKeyWordCheck(content: {
	cw?: string | null;
	text?: string | null;
	pollChoices?: string[] | null;
	others?: string[] | null;
}): string {
	return `${content.cw ?? ''}${content.text ?? ''}\n${(content.pollChoices ?? []).join('\n')}\n${(content.others ?? []).join('\n')}`;
}

/** hashtags は normalizeForSearch 済みで渡すこと。 */
export async function updateHashtagsRankings(
	deps: { meta: Pick<MiMeta, 'hiddenTags' | 'sensitiveWords'>; redis: Redis.Redis },
	hashtags: string[],
	userId: MiUser['id'],
): Promise<void> {
	const hiddenTags = new Set(deps.meta.hiddenTags.map((tag) => normalizeForSearch(tag)));
	const candidates = [...new Set(hashtags)].filter(
		(hashtag) => !hiddenTags.has(hashtag) && !isKeywordIncluded(hashtag, deps.meta.sensitiveWords),
	);
	if (candidates.length === 0) {
		return;
	}

	const checkPipeline = deps.redis.pipeline();
	for (const hashtag of candidates) {
		checkPipeline.sismember(`hashtagUsers:${hashtag}`, userId);
	}
	const checkResults = await checkPipeline.exec();
	if (checkResults == null) {
		throw new Error('Failed to check hashtag ranking users');
	}
	const hashtagsToUpdate: string[] = [];
	for (let i = 0; i < checkResults.length; i++) {
		const [error, exists] = checkResults[i]!;
		if (error != null) {
			throw error;
		}
		if (exists !== 1) {
			hashtagsToUpdate.push(candidates[i]!);
		}
	}
	if (hashtagsToUpdate.length === 0) {
		return;
	}

	// YYYYMMDDHHmm (10分間隔)
	const now = new Date();
	now.setMinutes(Math.floor(now.getMinutes() / 10) * 10, 0, 0);
	const window = formatHashtagUsersWindow(now);
	const currentFeaturedWindow = getCurrentFeaturedWindow(HASHTAG_RANKING_WINDOW);
	const redisPipeline = deps.redis.pipeline();
	for (const hashtag of hashtagsToUpdate) {
		redisPipeline.zincrby(`featuredHashtagsRanking:${currentFeaturedWindow}`, 1, hashtag);
		redisPipeline.expire(`featuredHashtagsRanking:${currentFeaturedWindow}`, (HASHTAG_RANKING_WINDOW * 3) / 1000, 'NX');
		redisPipeline.pfadd(`hashtagUsers:${hashtag}:${window}`, userId);
		redisPipeline.expire(`hashtagUsers:${hashtag}:${window}`, 60 * 60 * 24 * 3, 'NX');
		redisPipeline.sadd(`hashtagUsers:${hashtag}`, userId);
		redisPipeline.expire(`hashtagUsers:${hashtag}`, 60 * 60, 'NX');
	}
	await redisPipeline.exec();
}

export async function updateHashtagsRanking(
	deps: { meta: Pick<MiMeta, 'hiddenTags' | 'sensitiveWords'>; redis: Redis.Redis },
	hashtag: string,
	userId: MiUser['id'],
): Promise<void> {
	await updateHashtagsRankings(deps, [hashtag], userId);
}

async function extractMentionedUsers(
	deps: NoteCreationDependencies,
	user: { host: MiUser['host'] },
	tokens: mfm.MfmNode[],
): Promise<MiUser[]> {
	if (tokens == null) {
		return [];
	}
	const mentions = mfm.extractMentions(tokens);
	const accounts = mentions.map((mention) => {
		const host = mention.host ?? user.host;
		return {
			username: mention.username.toLowerCase(),
			host: host == null ? null : toPuny(host),
		};
	});
	const users = await listUsersByUsernamesAndHostsFromDatabase(deps.db, accounts).catch(() => []);
	const userByAccount = new Map(
		users.map((resolved) => [`${resolved.username.toLowerCase()}@${resolved.host ?? ''}`, resolved]),
	);
	const seenUserIds = new Set<MiUser['id']>();
	const resolvedUsers: MiUser[] = [];
	for (const account of accounts) {
		const resolved = userByAccount.get(`${account.username}@${account.host ?? ''}`);
		if (resolved == null || seenUserIds.has(resolved.id)) {
			continue;
		}
		seenUserIds.add(resolved.id);
		resolvedUsers.push(resolved);
	}
	return resolvedUsers;
}

type NoteNotificationType = 'mention' | 'reply' | 'renote' | 'quote' | 'note' | 'reaction';

type NoteNotificationRequest = {
	notifieeId: MiUser['id'];
	type: NoteNotificationType;
	extra: Record<string, unknown>;
	idempotencyKey?: string;
};

function deterministicUuidv7(sourceId: string, key: string): string {
	if (!/^[0-9a-f]{32}$/.test(sourceId)) {
		throw new Error(`Invalid UUIDv7 source: ${sourceId}`);
	}
	const hash = createHash('sha256').update(key).digest('hex');
	const variant = ((Number.parseInt(hash[3]!, 16) & 0x3) | 0x8).toString(16);
	return `${sourceId.slice(0, 12)}7${hash.slice(0, 3)}${variant}${hash.slice(4, 19)}`;
}

async function hydrateNotificationNoteRelations(
	deps: ApiNotificationDependencies & ApiNotificationsListDependencies,
	notes: MiNote[],
): Promise<MiNote[]> {
	const roots = notes.map((note) => ({ ...note }) as MiNote);
	const noteById = new Map<MiNote['id'], MiNote>(roots.map((note) => [note.id, note]));
	const register = (note: MiNote): MiNote => {
		const existing = noteById.get(note.id);
		if (existing != null) {
			return existing;
		}
		const cloned = { ...note } as MiNote;
		noteById.set(cloned.id, cloned);
		return cloned;
	};
	const expanded = new Set<MiNote['id']>();
	let detailFrontier = roots;
	while (detailFrontier.length > 0) {
		const current = detailFrontier.filter((note) => !expanded.has(note.id));
		if (current.length === 0) {
			break;
		}
		for (const note of current) {
			expanded.add(note.id);
			if (note.reply) {
				note.reply = register(note.reply);
			}
			if (note.renote) {
				note.renote = register(note.renote);
			}
		}

		const missingIds = [
			...new Set(
				current
					.flatMap((note) => [note.replyId, note.renoteId])
					.filter((id): id is MiNote['id'] => id != null && !noteById.has(id)),
			),
		];
		for (const relation of await listNotesByIdsFromDatabase(deps.db, missingIds)) {
			register(relation);
		}

		const nextFrontier: MiNote[] = [];
		for (const note of current) {
			if (note.replyId) {
				note.reply = noteById.get(note.replyId) ?? null;
			}
			if (note.renoteId) {
				note.renote = noteById.get(note.renoteId) ?? null;
				if (note.renote != null) {
					nextFrontier.push(note.renote);
				}
			}
		}
		detailFrontier = nextFrontier;
	}

	return roots;
}

async function createNoteNotifications(
	deps: ApiNotificationDependencies & ApiNotificationsListDependencies,
	notifierId: MiUser['id'],
	requests: readonly NoteNotificationRequest[],
	pushDeps: ApiPushNotificationDependencies = deps,
): Promise<void> {
	const pending = requests.filter((request) => request.notifieeId !== notifierId);
	if (pending.length === 0) {
		return;
	}

	const notifieeIds = [...new Set(pending.map((request) => request.notifieeId))];
	const [profiles, muterIds] = await Promise.all([
		listUserProfilesByUserIdsFromDatabase(deps.db, notifieeIds),
		listMuterIdsByMuteeIdAndMuterIdsFromDatabase(deps.db, notifierId, notifieeIds),
	]);
	const profileByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));
	const muterIdSet = new Set(muterIds);
	const candidates = pending
		.map((request) => {
			const profile = profileByUserId.get(request.notifieeId);
			return {
				request,
				profile,
				receiveConfig: profile?.notificationRecieveConfig[request.type],
			};
		})
		.filter((candidate) => candidate.receiveConfig?.type !== 'never' && !muterIdSet.has(candidate.request.notifieeId));
	if (candidates.length === 0) {
		return;
	}

	const notifieeFollowingCandidateIds = [
		...new Set(
			candidates
				.filter(
					(candidate) =>
						candidate.receiveConfig?.type === 'following' ||
						candidate.receiveConfig?.type === 'mutualFollow' ||
						candidate.receiveConfig?.type === 'followingOrFollower',
				)
				.map((candidate) => candidate.request.notifieeId),
		),
	];
	const notifierFollowingCandidateIds = [
		...new Set(
			candidates
				.filter(
					(candidate) =>
						candidate.receiveConfig?.type === 'follower' ||
						candidate.receiveConfig?.type === 'mutualFollow' ||
						candidate.receiveConfig?.type === 'followingOrFollower',
				)
				.map((candidate) => candidate.request.notifieeId),
		),
	];
	const candidateUserListIds = [
		...new Set(
			candidates.flatMap((candidate) =>
				candidate.receiveConfig?.type === 'list' ? [candidate.receiveConfig.userListId] : [],
			),
		),
	];
	const [notifieeFollowingNotifierIds, notifierFollowingNotifieeIds, memberUserListIds] = await Promise.all([
		listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase(deps.db, notifierId, notifieeFollowingCandidateIds),
		listFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabase(deps.db, notifierId, notifierFollowingCandidateIds),
		listUserListIdsContainingUserFromDatabase(deps.db, notifierId, candidateUserListIds),
	]);
	const notifieeFollowingNotifierIdSet = new Set(notifieeFollowingNotifierIds);
	const notifierFollowingNotifieeIdSet = new Set(notifierFollowingNotifieeIds);

	const accepted = candidates.filter((candidate) => {
		const config = candidate.receiveConfig;
		const notifieeId = candidate.request.notifieeId;
		if (config?.type === 'following') {
			return notifieeFollowingNotifierIdSet.has(notifieeId);
		}
		if (config?.type === 'follower') {
			return notifierFollowingNotifieeIdSet.has(notifieeId);
		}
		if (config?.type === 'mutualFollow') {
			return notifieeFollowingNotifierIdSet.has(notifieeId) && notifierFollowingNotifieeIdSet.has(notifieeId);
		}
		if (config?.type === 'followingOrFollower') {
			return notifieeFollowingNotifierIdSet.has(notifieeId) || notifierFollowingNotifieeIdSet.has(notifieeId);
		}
		if (config?.type === 'list') {
			return memberUserListIds.has(config.userListId);
		}
		return true;
	});
	if (accepted.length === 0) {
		return;
	}

	const stored = accepted.map((candidate) => {
		const notificationId =
			candidate.request.idempotencyKey == null
				? genId()
				: deterministicUuidv7(
						(candidate.request.extra['noteId'] as string | undefined) ?? candidate.request.idempotencyKey,
						candidate.request.idempotencyKey,
					);
		return {
			...candidate,
			notification: {
				id: notificationId,
				createdAt: parseId(notificationId).date.toISOString(),
				type: candidate.request.type,
				notifierId,
				...candidate.request.extra,
			},
		};
	});
	await xaddApiNotifications(
		deps,
		stored.map((item) => ({
			userId: item.request.notifieeId,
			notification: item.notification,
		})),
	);

	const notifier = await fetchUserByIdFromDatabase(deps.db, notifierId);
	if (notifier == null || notifier.isSuspended) {
		return;
	}
	const publishable = stored.filter(
		(item) => notifier.host == null || !item.profile?.mutedInstances.includes(notifier.host),
	);
	if (publishable.length === 0) {
		return;
	}

	const noteIds = [
		...new Set(
			publishable
				.map((item) => ('noteId' in item.notification ? item.notification.noteId : null))
				.filter((noteId): noteId is string => typeof noteId === 'string'),
		),
	];
	const fetchedNotes = await listNotesByIdsFromDatabase(deps.db, noteIds);
	if (fetchedNotes.length === 0) {
		return;
	}
	const notes = await hydrateNotificationNoteRelations(deps, fetchedNotes);
	const notePackHint = await createPackNoteStaticHintForApi(deps, notes);
	const packedNotifier =
		notePackHint.packedUsers.get(notifier.id) ?? (await packUserLiteForApi(deps, notifier).catch(() => null));
	if (packedNotifier == null) {
		return;
	}
	const packedUsers = new Map([[notifier.id, packedNotifier]]);
	const noteSources = new Map(notes.map((note) => [note.id, note]));

	const batchSize = 1000;
	for (let offset = 0; offset < publishable.length; offset += batchSize) {
		const batch = publishable.slice(offset, offset + batchSize);
		const notePackHintsByUserId = await createPackNoteHintsForUsersForApi(
			deps,
			notes,
			batch.map((item) => item.request.notifieeId),
			{ staticHint: notePackHint },
		);
		await Promise.all(
			batch.map(async (item) => {
				const packed = await packNotificationForApi(
					deps,
					item.notification as unknown as MiNotification,
					item.request.notifieeId,
					{ checkValidNotifier: false },
					{
						packedUsers,
						noteSources,
						notePackHint: notePackHintsByUserId.get(item.request.notifieeId) ?? notePackHint,
					},
				);
				if (packed != null) {
					deps.publishMainStream?.(item.request.notifieeId, 'notification', packed);
					void pushSwNotificationForApi(pushDeps, item.request.notifieeId, 'notification', packed);
				}
			}),
		);
	}
}

export async function createNoteNotification(
	deps: ApiNotificationDependencies & ApiNotificationsListDependencies,
	notifieeId: MiUser['id'],
	notifierId: MiUser['id'],
	type: NoteNotificationType,
	extra: Record<string, unknown>,
): Promise<void> {
	await createNoteNotifications(deps, notifierId, [{ notifieeId, type, extra }]);
}

type NotificationType = 'reply' | 'renote' | 'quote' | 'mention';

class NotificationManager {
	private queue = new Map<MiUser['id'], { target: MiUser['id']; reason: NotificationType }>();

	constructor(
		private notifier: { id: MiUser['id'] },
		private note: MiNote,
	) {}

	push(notifiee: MiUser['id'], reason: NotificationType): void {
		if (this.notifier.id === notifiee) {
			return;
		}
		const exist = this.queue.get(notifiee);
		if (exist) {
			if (reason !== 'mention') {
				exist.reason = reason;
			}
		} else {
			this.queue.set(notifiee, { reason, target: notifiee });
		}
	}

	async notify(deps: NoteCreationDependencies, pushDeps: ApiPushNotificationDependencies): Promise<void> {
		if (this.queue.size === 0) {
			return;
		}

		let visibleUserIds: Set<MiUser['id']> | null;
		switch (this.note.visibility) {
			case 'public':
			case 'home':
			case 'followers':
				visibleUserIds = null;
				break;
			case 'specified':
				visibleUserIds = new Set(this.note.visibleUserIds);
				break;
			default:
				visibleUserIds = new Set();
				break;
		}

		const requests: NoteNotificationRequest[] = [];
		for (const x of this.queue.values()) {
			const isVisibleToTarget = visibleUserIds === null || visibleUserIds.has(x.target);
			if (!isVisibleToTarget) {
				continue;
			}

			if (x.reason === 'renote') {
				requests.push({
					notifieeId: x.target,
					type: 'renote',
					extra: { noteId: this.note.id, targetNoteId: this.note.renoteId! },
					idempotencyKey: `${this.note.id}:${x.target}:renote`,
				});
			} else {
				requests.push({
					notifieeId: x.target,
					type: x.reason,
					extra: { noteId: this.note.id },
					idempotencyKey: `${this.note.id}:${x.target}:${x.reason}`,
				});
			}
		}
		await createNoteNotifications(deps, this.notifier.id, requests, pushDeps);
	}
}

export async function fetchOrRegisterInstance(
	deps: { db: MiDrizzleDatabase },
	host: string,
): Promise<{ id: string; host: string }> {
	const puny = toPuny(host);
	const existing = await fetchInstanceByHostFromDatabase(deps.db, puny);
	if (existing != null) {
		return existing;
	}

	return await createInstanceIfNotExistsInDatabase(deps.db, {
		id: genId(),
		host: puny,
		firstRetrievedAt: new Date(),
	});
}

async function enqueueUserWebhook(
	deps: NoteCreationDependencies,
	userId: MiUser['id'],
	type: 'note' | 'reply' | 'renote' | 'mention',
	note: unknown,
	idempotencyKey?: string,
): Promise<void> {
	const webhooks = await listActiveWebhooksByUserIdAndEventFromDatabase(deps.db, userId, type);

	await Promise.all(
		webhooks.map((webhook) => {
			const eventId =
				idempotencyKey == null
					? genId()
					: deterministicUuidv7(idempotencyKey, `${idempotencyKey}:${webhook.id}:${type}`);
			const data: UserWebhookDeliverJobData = {
				type,
				content: { note } as UserWebhookDeliverJobData['content'],
				webhookId: webhook.id,
				userId: webhook.userId,
				to: webhook.url,
				secret: webhook.secret,
				createdAt: parseId(eventId).date.getTime(),
				eventId,
			};

			return deps.userWebhookDeliverQueue.add(webhook.id, data, {
				attempts: 4,
				backoff: { type: 'custom' },
				...(idempotencyKey == null ? {} : { jobId: `note-webhook-${eventId}` }),
				...queueRetentionOptions(deps.config),
			});
		}),
	);
}

export type CreateNoteData = {
	createdAt: Date | null;
	name?: string | null;
	text: string | null;
	reply: MiNote | null;
	renote: MiNote | null;
	files: MiDriveFile[];
	poll: IPoll | null;
	localOnly: boolean;
	reactionAcceptance: MiNote['reactionAcceptance'];
	cw: string | null;
	visibility: MiNote['visibility'];
	visibleUsers: MiUser[] | null;
	channel: MiChannel | null;
	apMentions?: MiUser[] | null;
	apMentionRawCount?: number;
	apHashtags?: string[] | null;
	apEmojis?: string[] | null;
	uri?: string | null;
	url?: string | null;
};

// 再実行時の DB/Redis 最終状態と通知キーを冪等に保つ。Pub/Sub や外部配送の exactly-once
// は保証しない。analytics は加算処理で冪等でないため含めない。
const notePostCreateStages = [
	'fanout',
	'antennas',
	'followerNotifications',
	'poll',
	'streamsAndRole',
	'notifications',
	'webhooks',
	'federation',
] as const satisfies readonly DbNotePostCreateStage[];

/**
 * enqueue 時点で no-op と確定するステージ。条件は postNoteCreated の
 * 各ステージ冒頭ガードの鏡像に保つこと。DB 参照が要る判定はここに置かない。
 */
function isNoopPostCreateStage(
	stage: DbNotePostCreateStage,
	data: CreateNoteData,
	user: { host: MiUser['host'] },
	silent: boolean,
	mentionedUsers: MiUser[],
): boolean {
	switch (stage) {
		case 'poll':
			return data.poll?.expiresAt == null;
		case 'followerNotifications':
			return data.reply != null || data.visibility === 'specified';
		case 'notifications': {
			if (silent) {
				return true;
			}
			const hasLocalMention = mentionedUsers.some((u) => u.host == null);
			const hasLocalReplyTarget = data.reply != null && data.reply.userHost === null;
			const hasLocalRenoteTarget = data.renote != null && data.renote.userHost === null;
			return !hasLocalMention && !hasLocalReplyTarget && !hasLocalRenoteTarget;
		}
		case 'webhooks':
		case 'streamsAndRole':
			return silent;
		case 'federation':
			return silent || data.localOnly || user.host != null;
		default:
			return false;
	}
}

type PersistedNote = {
	note: MiNote;
	outboxJobs: (InlineDbOutboxJob & { data: DbNotePostCreateJobData })[];
};

type PostCreateNoteData = Omit<CreateNoteData, 'reply' | 'renote'> & {
	reply: DbNotePostCreateJobData['reply'];
	renote: DbNotePostCreateJobData['renote'];
};

function isRenoteData<T extends { renote?: unknown | null }>(
	data: T,
): data is T & { renote: NonNullable<T['renote']> } {
	return data.renote != null;
}

function isQuoteData(data: {
	renote: unknown;
	reply?: unknown | null;
	text?: string | null;
	cw?: string | null;
	poll?: unknown | null;
	files?: readonly unknown[] | null;
}): boolean {
	return (
		data.text != null ||
		data.reply != null ||
		data.cw != null ||
		data.poll != null ||
		(data.files != null && data.files.length > 0)
	);
}

async function insertNote(
	deps: NoteCreationDependencies,
	user: { id: MiUser['id']; host: MiUser['host']; isBot: boolean },
	data: CreateNoteData,
	tags: string[],
	emojis: string[],
	mentionedUsers: MiUser[],
	silent: boolean,
	db: MiDrizzleDatabase = deps.db,
): Promise<PersistedNote> {
	const insert: Parameters<typeof createNoteWithAuthorAndInlineJobsInDatabase>[1] = {
		id: genId(data.createdAt?.getTime()),
		uri: data.uri ?? null,
		url: data.url ?? null,
		fileIds: data.files.map((f) => f.id),
		replyId: data.reply ? data.reply.id : null,
		renoteId: data.renote ? data.renote.id : null,
		channelId: data.channel ? data.channel.id : null,
		threadId: data.reply ? (data.reply.threadId ?? data.reply.id) : null,
		name: data.name ?? null,
		text: data.text ?? null,
		hasPoll: data.poll != null,
		cw: data.cw ?? null,
		tags: tags.map((t) => normalizeForSearch(t)),
		emojis,
		userId: user.id,
		localOnly: data.localOnly,
		reactionAcceptance: data.reactionAcceptance ?? null,
		reactions: {},
		reactionAndUserPairCache: [],
		renoteCount: 0,
		repliesCount: 0,
		clippedCount: 0,
		pageCount: 0,
		visibility: data.visibility,
		visibleUserIds:
			data.visibility === 'specified' ? (data.visibleUsers ? data.visibleUsers.map((u) => u.id) : []) : [],
		mentions: [],
		mentionedRemoteUsers: '[]',
		attachedFileTypes: data.files.map((f) => f.type),
		replyUserId: data.reply ? data.reply.userId : null,
		replyUserHost: data.reply ? data.reply.userHost : null,
		renoteUserId: data.renote ? data.renote.userId : null,
		renoteUserHost: data.renote ? data.renote.userHost : null,
		renoteChannelId: data.renote ? data.renote.channelId : null,
		userHost: user.host,
	};

	if (mentionedUsers.length > 0) {
		insert.mentions = mentionedUsers.map((u) => u.id);
		const profiles = await listUserProfilesByUserIdsFromDatabase(
			db,
			mentionedUsers.map((u) => u.id),
		);
		const profileByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));
		insert.mentionedRemoteUsers = JSON.stringify(
			mentionedUsers
				.filter((u): u is MiUser & { host: string } => u.host != null)
				.map((u) => {
					const profile = profileByUserId.get(u.id);
					return {
						uri: u.uri,
						url: profile?.url ?? undefined,
						username: u.username,
						host: u.host,
					} as IMentionedRemoteUsers[0];
				}),
		);
	}

	try {
		return await db.transaction(async (transaction) => {
			const tx = transaction as MiDrizzleDatabase;
			const jobDataList: DbNotePostCreateJobData[] = notePostCreateStages
				.filter((stage) => !isNoopPostCreateStage(stage, data, user, silent, mentionedUsers))
				.map((stage) => ({
					noteId: insert.id,
					mentionedUserIds: mentionedUsers.map((u) => u.id),
					reply:
						data.reply == null
							? null
							: {
									id: data.reply.id,
									userId: data.reply.userId,
									userHost: data.reply.userHost,
									threadId: data.reply.threadId,
								},
					renote:
						data.renote == null
							? null
							: {
									id: data.renote.id,
									userId: data.renote.userId,
									userHost: data.renote.userHost,
									uri: data.renote.uri,
								},
					silent,
					stage,
				}));
			const { author, jobs: enqueued } = await createNoteWithAuthorAndInlineJobsInDatabase(tx, insert, jobDataList, {
				attempts: 12,
				backoff: { type: 'exponential', delay: 1000 },
				removeOnComplete: true,
				removeOnFail: false,
			});
			if (data.poll != null) {
				await createPollInDatabase(tx, {
					noteId: insert.id,
					choices: data.poll.choices,
					expiresAt: data.poll.expiresAt,
					multiple: data.poll.multiple,
					votes: new Array(data.poll.choices.length).fill(0),
					noteVisibility: insert.visibility,
					userId: user.id,
					userHost: user.host,
					channelId: insert.channelId,
				});
			}

			if (data.reply) {
				await incrementNoteRepliesCountInDatabase(tx, data.reply.id, 1);
			}
			if (data.renote && data.renote.userId !== user.id && !user.isBot) {
				await incrementNoteRenoteCountInDatabase(tx, data.renote.id, 1);
			}
			if (data.visibility === 'public' || data.visibility === 'home') {
				const names = [...new Set(tags.map((tag) => normalizeForSearch(tag)))];
				await recordHashtagUsagesInDatabase(tx, {
					entries: names.map((name) => ({ id: genId(), name })),
					userId: user.id,
					isLocalUser: user.host == null,
					isRemoteUser: user.host != null,
					isUserAttached: false,
					increment: true,
				});
			}
			if (deps.meta.enableStatsForFederatedInstances && user.host != null) {
				const instance = await fetchOrRegisterInstance({ db: tx }, user.host);
				await adjustInstanceNotesCountFromDatabase(tx, instance.id, 1);
			}
			if (data.channel) {
				await incrementChannelNotesCountAndUpdateLastNotedAtInDatabase(tx, data.channel.id, new Date());
				const count = await countNotesByUserIdAndChannelIdFromDatabase(tx, user.id, data.channel.id);
				if (count === 1) {
					await incrementChannelUsersCountInDatabase(tx, data.channel.id);
				}
			}

			// 投稿数更新と同じ行の snapshot を、pack と条件付きロール評価で共有する。
			const note = {
				...insert,
				user: author,
				reply: data.reply ?? null,
				renote: data.renote ?? null,
			} as unknown as MiNote;
			const outboxJobs: PersistedNote['outboxJobs'] = enqueued.map((outboxJob, index) => ({
				...outboxJob,
				data: jobDataList[index]!,
			}));
			return { note, outboxJobs };
		});
	} catch (err) {
		if (isDuplicateKeyValueError(err)) {
			const e = new Error('Duplicated note');
			e.name = 'duplicated';
			throw e;
		}
		throw err;
	}
}

type NoteAnalyticsEvent = {
	note: Pick<MiNote, 'id' | 'userId' | 'userHost' | 'visibility' | 'replyId' | 'renoteId' | 'fileIds'>;
	userHost: MiUser['host'];
	tags: string[];
	silent: boolean;
};

async function runNoteAnalytics(deps: NoteCreationDependencies, event: NoteAnalyticsEvent): Promise<void> {
	const { note, userHost, tags, silent } = event;
	try {
		const updates: Promise<unknown>[] = [Promise.resolve(deps.chartWriters.notesChart.update(note, true))];
		if (note.visibility !== 'specified' && (deps.meta.enableChartsForRemoteUser || userHost == null)) {
			updates.push(Promise.resolve(deps.chartWriters.perUserNotesChart.update({ id: note.userId }, note, true)));
		}
		if (userHost != null) {
			updates.push(
				fetchOrRegisterInstance(deps, userHost).then(async (instance) => {
					if (deps.meta.enableChartsForFederatedInstances) {
						await deps.chartWriters.instanceChart.updateNote(instance.host, note, true);
					}
				}),
			);
		}
		if (note.visibility === 'public' || note.visibility === 'home') {
			const names = [...new Set(tags.map((tag) => normalizeForSearch(tag)))];
			updates.push(updateHashtagsRankings(deps, names, note.userId));
		}
		if (!silent && userHost == null) {
			updates.push(Promise.resolve(deps.chartWriters.activeUsersChart.write({ id: note.userId, host: null })));
		}
		const results = await Promise.allSettled(updates);
		const errors = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
		if (errors.length > 0)
			throw new AggregateError(
				errors.map((result) => result.reason),
				'Note analytics failed',
			);
	} catch (error) {
		console.error(`Failed to run analytics stage for note ${note.id}`, error);
	}
}

type NotePostCreateContext = {
	note: MiNote;
	user: { id: MiUser['id']; username: string; host: MiUser['host']; isBot: boolean };
	data: PostCreateNoteData;
	tags: string[];
	mentionedUsers: MiUser[];
	silent: boolean;
};

async function postNoteCreated(
	deps: NoteCreationDependencies,
	note: MiNote,
	user: { id: MiUser['id']; username: string; host: MiUser['host']; isBot: boolean },
	data: PostCreateNoteData,
	tags: string[],
	mentionedUsers: MiUser[],
	silent: boolean,
	stage: DbNotePostCreateStage,
	pushDeps: ApiPushNotificationDependencies = deps,
): Promise<void> {
	if (stage === 'fanout' && deps.meta.enableFanoutTimeline) {
		await pushNoteToFanoutTimelines(deps, note, user);
	}

	if (stage === 'antennas') {
		await addNoteToAntennasForApi(deps, { ...note, channel: data.channel ?? null }, user);
	}

	if (stage === 'followerNotifications' && data.reply == null) {
		const followerIds = (await listFollowersForNoteDeliveryForRequest(deps.db, user.id))
			.filter((follower) => follower.notify === 'normal')
			.map((follower) => follower.followerId);
		if (note.visibility !== 'specified') {
			const isPureRenote = isRenoteData(data) && !isQuoteData(data);
			const renoteMuterIds = isPureRenote
				? new Set(await listRenoteMuterIdsByMuteeIdFromDatabase(deps.db, user.id))
				: null;
			const requests = followerIds
				.filter((followerId) => !renoteMuterIds?.has(followerId))
				.map((followerId) => ({
					notifieeId: followerId,
					type: 'note' as const,
					extra: { noteId: note.id },
					idempotencyKey: `${note.id}:${followerId}:note`,
				}));
			await createNoteNotifications(deps, user.id, requests, pushDeps);
		}
	}

	if (stage === 'poll' && data.poll?.expiresAt) {
		const delay = data.poll.expiresAt.getTime() - Date.now();
		await deps.endedPollNotificationQueue.add(
			note.id,
			{ noteId: note.id },
			{
				delay,
				jobId: `note-post-poll-${note.id}`,
				...queueRetentionOptions(deps.config),
			},
		);
	}

	if (!silent && stage === 'streamsAndRole') {
		const noteObj = await packNoteForApi(deps, note, null, { skipHide: true, withReactionAndUserPairCache: true });
		await addNoteToRoleTimelines(deps, noteObj, note.user);
		deps.publishNotesStream?.(noteObj);
	}

	if (!silent && stage === 'notifications') {
		const noteObj = await packNoteForApi(deps, note, null, { skipHide: true, withReactionAndUserPairCache: true });
		const nm = new NotificationManager(user, note);
		const publishMainStreamEvents: (() => void)[] = [];
		const localMentionedUsers = mentionedUsers.filter((u) => u.host == null);
		const threadMutedUserIds = new Set(
			await listNoteThreadMutedUserIdsFromDatabase(
				deps.db,
				note.threadId ?? note.id,
				localMentionedUsers.map((u) => u.id),
			),
		);
		await Promise.all(
			localMentionedUsers
				.filter((u) => !threadMutedUserIds.has(u.id))
				.map(async (u) => {
					const detailPackedNote = await packNoteForApi(deps, note, u, { detail: true });
					publishMainStreamEvents.push(() => deps.publishMainStream?.(u.id, 'mention', detailPackedNote));
					nm.push(u.id, 'mention');
				}),
		);

		if (data.reply) {
			if (data.reply.userHost === null) {
				const isThreadMuted = await noteThreadMutingExistsInDatabase(
					deps.db,
					data.reply.userId,
					data.reply.threadId ?? data.reply.id,
				);
				if (!isThreadMuted) {
					nm.push(data.reply.userId, 'reply');
					publishMainStreamEvents.push(() => deps.publishMainStream?.(data.reply!.userId, 'reply', noteObj));
				}
			}
		}

		if (isRenoteData(data)) {
			const type = isQuoteData(data) ? 'quote' : 'renote';
			if (data.renote.userHost === null) {
				nm.push(data.renote.userId, type);
			}
			if (user.id !== data.renote.userId && data.renote.userHost === null) {
				publishMainStreamEvents.push(() => deps.publishMainStream?.(data.renote!.userId, 'renote', noteObj));
			}
		}

		await nm.notify(deps, pushDeps);
		for (const publish of publishMainStreamEvents) {
			publish();
		}
	}

	if (!silent && stage === 'webhooks') {
		const noteObj = await packNoteForApi(deps, note, null, { skipHide: true, withReactionAndUserPairCache: true });
		await enqueueUserWebhook(deps, user.id, 'note', noteObj, note.id);
		const localMentionedUsers = mentionedUsers.filter((mentioned) => mentioned.host == null);
		const threadMutedUserIds = new Set(
			await listNoteThreadMutedUserIdsFromDatabase(
				deps.db,
				note.threadId ?? note.id,
				localMentionedUsers.map((mentioned) => mentioned.id),
			),
		);
		await Promise.all(
			localMentionedUsers
				.filter((mentioned) => !threadMutedUserIds.has(mentioned.id))
				.map(async (mentioned) => {
					const detailPackedNote = await packNoteForApi(deps, note, mentioned, { detail: true });
					await enqueueUserWebhook(deps, mentioned.id, 'mention', detailPackedNote, note.id);
				}),
		);
		if (data.reply?.userHost === null) {
			const isThreadMuted = await noteThreadMutingExistsInDatabase(
				deps.db,
				data.reply.userId,
				data.reply.threadId ?? data.reply.id,
			);
			if (!isThreadMuted) {
				await enqueueUserWebhook(deps, data.reply.userId, 'reply', noteObj, note.id);
			}
		}
		if (data.renote?.userHost === null && user.id !== data.renote.userId) {
			await enqueueUserWebhook(deps, data.renote.userId, 'renote', noteObj, note.id);
		}
	}

	if (!silent && stage === 'federation' && !data.localOnly && user.host == null) {
		const activity = renderOnce(() =>
			renderNoteOrRenoteActivityForApi(
				deps,
				{
					localOnly: data.localOnly,
					renote: data.renote,
					isQuote: isRenoteData(data) && isQuoteData(data),
				},
				note,
			),
		);

		const recipientUsers = note.visibility === 'specified' ? (data.visibleUsers ?? []) : mentionedUsers;
		const directRecipients = (
			await Promise.all(
				recipientUsers.filter((u) => u.host != null).map((u) => resolveRemoteRecipientForApi(deps, u.id)),
			)
		).filter((u): u is NonNullable<typeof u> => u != null);

		if (data.reply && data.reply.userHost !== null) {
			const u = await resolveRemoteRecipientForApi(deps, data.reply.userId);
			if (u) {
				directRecipients.push(u);
			}
		}
		if (data.renote && data.renote.userHost !== null) {
			const u = await resolveRemoteRecipientForApi(deps, data.renote.userId);
			if (u) {
				directRecipients.push(u);
			}
		}

		await deliverNoteActivityForApi(deps, user, activity, {
			directRecipients,
			deliverToFollowers: ['public', 'home', 'followers'].includes(note.visibility),
			jobIdPrefix: `note-create-${note.id}`,
		});

		if (note.visibility === 'public') {
			await deliverToRelaysForApi(deps, { id: user.id, host: null }, activity, `note-relay-${note.id}`);
		}
	}
}

async function loadNotePostCreateContext(
	deps: NoteCreationDependencies,
	data: DbNotePostCreateJobData,
): Promise<NotePostCreateContext | null> {
	const snapshot = await fetchNotePostCreateSnapshotFromDatabase(deps.db, data.noteId);
	if (snapshot == null) return null;
	const { note, user } = snapshot;
	void memoizeInRequest(ROLES_VERSION_MEMO_KEY, () => Promise.resolve(snapshot.rolesVersion));
	void memoizeInRequest(followersForNoteDeliveryMemoKey(user.id), () => Promise.resolve(snapshot.followers));
	const [mentionedUsers, files, reply, renote, channel, poll, visibleUsers] = await Promise.all([
		listUsersByIdsFromDatabase(deps.db, data.mentionedUserIds, { includeSuspended: true }),
		listDriveFilesByIdsFromDatabase(deps.db, note.fileIds),
		note.replyId == null ? null : fetchNoteByIdFromDatabase(deps.db, note.replyId),
		note.renoteId == null ? null : fetchNoteByIdFromDatabase(deps.db, note.renoteId),
		note.channelId == null ? null : fetchChannelByIdFromDatabase(deps.db, note.channelId),
		note.hasPoll ? fetchPollByNoteIdFromDatabase(deps.db, note.id) : null,
		listUsersByIdsFromDatabase(deps.db, note.visibleUserIds, { includeSuspended: true }),
	]);
	const effectiveReply: DbNotePostCreateJobData['reply'] =
		reply ??
		(data.reply == null
			? null
			: {
					...data.reply,
					threadId: data.reply.threadId ?? data.reply.id,
				});
	return {
		note: { ...note, user, reply, renote },
		user,
		data: {
			createdAt: null,
			text: note.text,
			reply: effectiveReply,
			renote: renote ?? data.renote,
			files,
			poll,
			localOnly: note.localOnly,
			reactionAcceptance: note.reactionAcceptance,
			cw: note.cw,
			visibility: note.visibility,
			visibleUsers,
			channel,
		},
		tags: note.tags,
		mentionedUsers,
		silent: data.silent,
	};
}

async function runNotePostCreateStage(
	deps: NoteCreationDependencies,
	context: NotePostCreateContext,
	stage: DbNotePostCreateStage,
	pushDeps: ApiPushNotificationDependencies,
): Promise<void> {
	await postNoteCreated(
		deps,
		context.note,
		context.user,
		context.data,
		context.tags,
		context.mentionedUsers,
		context.silent,
		stage,
		pushDeps,
	);
}

export async function handleQueueNotePostCreate(
	deps: NoteCreationDependencies,
	data: DbNotePostCreateJobData,
	pushDeps: ApiPushNotificationDependencies = deps,
): Promise<void> {
	const context = await loadNotePostCreateContext(deps, data);
	if (context != null) await runNotePostCreateStage(deps, context, data.stage, pushDeps);
}

async function runNotePostCreateBatch(
	deps: NoteCreationDependencies,
	jobs: PersistedNote['outboxJobs'],
	required: boolean,
	input?: NotePostCreateContext,
): Promise<void> {
	if (jobs.length === 0) return;
	try {
		const ownedIds = await runInlineDbOutboxJobs(deps.db, jobs, async (db, ownedIds) => {
			const stageDeps = { ...deps, db };
			const context = input ?? (await loadNotePostCreateContext(stageDeps, jobs[0]!.data));
			if (context == null) return;
			for (const job of jobs) {
				if (ownedIds.has(job.outboxId)) {
					// 非同期 Push cleanup には、終了する batch transaction を渡さない。
					await runNotePostCreateStage(stageDeps, context, job.data.stage, deps);
				}
			}
		});
		if (required) {
			for (const job of jobs) {
				if (!ownedIds.has(job.outboxId)) await waitForDbOutboxJob(deps.db, deps.dbQueue, job.outboxId);
			}
		}
	} catch (error) {
		console.error(`Failed to complete post-create batch for note ${jobs[0]!.data.noteId}`, error);
		if (required) throw error;
	}
}

function deferredNotePostCreateTask(
	deps: NoteCreationDependencies,
	jobs: PersistedNote['outboxJobs'],
	analytics: NoteAnalyticsEvent,
): () => Promise<void> {
	// HTTP のモデル群や memo ではなく、業務payloadと作成イベントだけを保持する。
	return async () => {
		await runNoteAnalytics(deps, analytics);
		await runNotePostCreateBatch(deps, jobs, false);
	};
}

async function addNoteToRoleTimelines(
	deps: NoteCreationDependencies,
	noteObj: Packed<'Note'>,
	author: MiUser | null,
): Promise<void> {
	// コンディショナルロールの評価には full MiUser が要る。投稿経路では note.user に載っている。
	const user = author ?? (await fetchUserByIdOrFailFromDatabase(deps.db, noteObj.userId));
	const roles = await getApiUserRoles(deps, user);
	if (roles.length === 0) {
		return;
	}

	const r = new FanoutTimelinePush(noteObj.id);
	for (const role of roles) {
		r.add(`roleTimeline:${role.id}`, 1000);
	}
	await r.flush(deps.redisForTimelines);
	for (const role of roles) {
		deps.publishRoleTimelineStream?.(role.id, 'note', noteObj);
	}
}

async function pushNoteToFanoutTimelines(
	deps: NoteCreationDependencies,
	note: MiNote,
	user: { id: MiUser['id']; host: MiUser['host'] },
): Promise<void> {
	const r = new FanoutTimelinePush(note.id);

	if (note.channelId) {
		r.add(`channelTimeline:${note.channelId}`, deps.config.limits.channelTimelineNotes);
		r.add(
			`userTimelineWithChannel:${user.id}`,
			note.userHost == null ? deps.meta.perLocalUserUserTimelineCacheMax : deps.meta.perRemoteUserUserTimelineCacheMax,
		);

		const channelFollowerIds = await listFollowerUserIdsByChannelIdFromDatabase(deps.db, note.channelId);
		for (const followerId of channelFollowerIds) {
			r.add(`homeTimeline:${followerId}`, deps.meta.perUserHomeTimelineCacheMax);
			if (note.fileIds.length > 0) {
				r.add(`homeTimelineWithFiles:${followerId}`, deps.meta.perUserHomeTimelineCacheMax / 2);
			}
		}
	} else {
		let [followings, userListMemberships] = await Promise.all([
			listFollowersForNoteDeliveryForRequest(deps.db, user.id).then((followers) =>
				followers.filter((follower) => follower.followerHost == null && !follower.isFollowerHibernated),
			),
			listUserListMembershipsForFanoutByUserIdFromDatabase(deps.db, user.id),
		]);
		const followerIdSet = new Set(followings.map((following) => following.followerId));
		const visibleUserIdSet = new Set(note.visibleUserIds);

		if (note.visibility === 'followers') {
			userListMemberships = userListMemberships.filter(
				(x) => x.userListUserId === user.id || followerIdSet.has(x.userListUserId),
			);
		}

		for (const following of followings) {
			if (note.visibility === 'specified' && !visibleUserIdSet.has(following.followerId)) {
				continue;
			}
			if (isReply(note, following.followerId) && !following.withReplies) {
				continue;
			}

			r.add(`homeTimeline:${following.followerId}`, deps.meta.perUserHomeTimelineCacheMax);
			if (note.fileIds.length > 0) {
				r.add(`homeTimelineWithFiles:${following.followerId}`, deps.meta.perUserHomeTimelineCacheMax / 2);
			}
		}

		for (const membership of userListMemberships) {
			if (
				note.visibility === 'specified' &&
				note.userId !== membership.userListUserId &&
				!visibleUserIdSet.has(membership.userListUserId)
			) {
				continue;
			}
			if (isReply(note, membership.userListUserId) && !membership.withReplies) {
				continue;
			}

			r.add(`userListTimeline:${membership.userListId}`, deps.meta.perUserListTimelineCacheMax);
			if (note.fileIds.length > 0) {
				r.add(`userListTimelineWithFiles:${membership.userListId}`, deps.meta.perUserListTimelineCacheMax / 2);
			}
		}

		if (note.userHost == null) {
			if (note.visibility !== 'specified' || !visibleUserIdSet.has(user.id)) {
				r.add(`homeTimeline:${user.id}`, deps.meta.perUserHomeTimelineCacheMax);
				if (note.fileIds.length > 0) {
					r.add(`homeTimelineWithFiles:${user.id}`, deps.meta.perUserHomeTimelineCacheMax / 2);
				}
			}
		}

		if (isReply(note)) {
			r.add(
				`userTimelineWithReplies:${user.id}`,
				note.userHost == null
					? deps.meta.perLocalUserUserTimelineCacheMax
					: deps.meta.perRemoteUserUserTimelineCacheMax,
			);
			if (note.visibility === 'public' && note.userHost == null) {
				r.add('localTimelineWithReplies', 300);
				if (note.replyUserHost == null) {
					r.add(`localTimelineWithReplyTo:${note.replyUserId}`, 300 / 10);
				}
			}
		} else {
			r.add(
				`userTimeline:${user.id}`,
				note.userHost == null
					? deps.meta.perLocalUserUserTimelineCacheMax
					: deps.meta.perRemoteUserUserTimelineCacheMax,
			);
			if (note.fileIds.length > 0) {
				r.add(
					`userTimelineWithFiles:${user.id}`,
					note.userHost == null
						? deps.meta.perLocalUserUserTimelineCacheMax / 2
						: deps.meta.perRemoteUserUserTimelineCacheMax / 2,
				);
			}
			if (note.visibility === 'public' && note.userHost == null) {
				r.add('localTimeline', 1000);
				if (note.fileIds.length > 0) {
					r.add('localTimelineWithFiles', 500);
				}
			}
		}
	}

	await r.flush(deps.redisForTimelines);
}

export async function createNote(
	deps: NoteCreationDependencies,
	user: { id: MiUser['id']; username: string; host: MiUser['host']; isBot: boolean },
	data: CreateNoteData,
	silent = false,
	persist: (insert: (db: MiDrizzleDatabase) => Promise<PersistedNote>) => Promise<PersistedNote> = (insert) =>
		insert(deps.db),
	options: { reservation?: NotePostProcessingReservation; signal?: AbortSignal } = {},
): Promise<MiNote> {
	if (data.reply && data.channel && data.reply.channelId !== data.channel.id) {
		data.channel = data.reply.channelId ? await fetchChannelByIdFromDatabase(deps.db, data.reply.channelId) : null;
	}
	if (data.reply && data.channel == null && data.reply.channelId) {
		data.channel = await fetchChannelByIdFromDatabase(deps.db, data.reply.channelId);
	}

	if (data.channel != null) {
		data.visibility = 'public';
		data.visibleUsers = [];
		data.localOnly = true;
	}

	// ロールポリシーはこの関数内で2箇所 (canPublicNote / mentionLimit) から参照するため1回だけ解決する。
	const policies = await getApiRolePolicies(deps, user as MiUser);

	if (data.visibility === 'public' && data.channel == null) {
		if (isKeywordIncluded(data.cw ?? data.text ?? '', deps.meta.sensitiveWords) || policies.canPublicNote === false) {
			data.visibility = 'home';
		}
	}

	if (
		isKeywordIncluded(
			concatNoteContentsForKeyWordCheck(
				omitUndefined({ cw: data.cw, text: data.text, pollChoices: data.poll?.choices }),
			),
			deps.meta.prohibitedWords,
		)
	) {
		throw new IdentifiableError('689ee33f-f97c-479a-ac49-1b9f8140af99', 'Note contains prohibited words');
	}

	const inSilencedInstance = isSilencedHost(deps.meta.silencedHosts, user.host);
	if (data.visibility === 'public' && inSilencedInstance && user.host !== null) {
		data.visibility = 'home';
	}

	if (data.renote) {
		switch (data.renote.visibility) {
			case 'public':
				break;
			case 'home':
				if (data.visibility === 'public') {
					data.visibility = 'home';
				}
				break;
			case 'followers':
				if (data.renote.userId !== user.id) {
					throw new Error('Renote target is not public or home');
				}
				if (data.visibility === 'public' || data.visibility === 'home') {
					data.visibility = 'followers';
				}
				break;
			case 'specified':
				throw new Error('Renote target is not public or home');
		}
	}

	if (isRenoteData(data) && !isQuoteData(data)) {
		if (data.renote.userHost === null && data.renote.userId !== user.id) {
			const blocked = await blockingExistsInDatabase(deps.db, data.renote.userId, user.id);
			if (blocked) {
				throw new Error('blocked');
			}
		}
	}

	// リプライは返信対象より広い公開範囲になれない。
	// 特に followers 宛てへのリプライを home のまま通すと、フォロワー限定投稿にぶら下がったスレッドが
	// プロフィール・ローカルタイムラインから第三者に見えてしまう。
	// specified (ダイレクト) 宛ては notes/create 側で公開範囲不一致を先に弾いており、
	// ここで specified へ落とすと宛先の無いノートを作ってしまうので触らない。
	if (data.reply) {
		if (data.reply.visibility === 'home' && data.visibility === 'public') {
			data.visibility = 'home';
		} else if (data.reply.visibility === 'followers' && (data.visibility === 'public' || data.visibility === 'home')) {
			data.visibility = 'followers';
		}
	}

	if (data.renote && data.renote.localOnly && data.channel == null) {
		data.localOnly = true;
	}
	if (data.reply && data.reply.localOnly && data.channel == null) {
		data.localOnly = true;
	}

	if (data.text) {
		if (data.text.length > DB_MAX_NOTE_TEXT_LENGTH) {
			data.text = data.text.slice(0, DB_MAX_NOTE_TEXT_LENGTH);
		}
		data.text = data.text.trim();
		if (data.text === '') {
			data.text = null;
		}
	} else {
		data.text = null;
	}

	// リモートの summary は長さの保証が無く、そのままだと varchar(512) の挿入で落ちて
	// inbox ジョブが再試行され続ける。text と同じく列長で切る。
	if (data.cw != null && data.cw.length > DB_MAX_NOTE_CW_LENGTH) {
		data.cw = data.cw.slice(0, DB_MAX_NOTE_CW_LENGTH);
	}

	let tags = data.apHashtags;
	let emojis = data.apEmojis;
	let mentionedUsers: MiUser[] | null | undefined = data.apMentions;

	if (!tags || !emojis || !mentionedUsers) {
		const tokens = data.text ? parseMfmCached(data.text) : [];
		const cwTokens = data.cw ? mfm.parse(data.cw) : [];
		const choiceTokens = data.poll?.choices ? concat(data.poll.choices.map((c) => mfm.parse(c))) : [];
		const combined = tokens.concat(cwTokens).concat(choiceTokens);

		tags = data.apHashtags ?? extractHashtags(combined);
		emojis = data.apEmojis ?? extractCustomEmojisFromMfm(combined);
		mentionedUsers = data.apMentions ?? (await extractMentionedUsers(deps, user, combined));
	}

	if (isMediaSilencedHost(deps.meta.mediaSilencedHosts, user.host)) {
		emojis = [];
	}

	tags = tags.filter((tag) => Array.from(tag).length <= 128).splice(0, 32);

	const resolvedApMentionUserIds = new Set((data.apMentions ?? []).map((user) => user.id));
	const finalMentionedUsers: MiUser[] = mentionedUsers ?? [];
	const finalMentionedUserIds = new Set(finalMentionedUsers.map((user) => user.id));
	let replyUserForVisibility: MiUser | null = null;

	if (data.reply && user.id !== data.reply.userId && !finalMentionedUserIds.has(data.reply.userId)) {
		replyUserForVisibility = await fetchUserByIdOrFailFromDatabase(deps.db, data.reply.userId);
		finalMentionedUsers.push(replyUserForVisibility);
		finalMentionedUserIds.add(replyUserForVisibility.id);
	}

	if (data.visibility === 'specified') {
		if (data.visibleUsers == null) {
			throw new Error('invalid param');
		}
		const visibleUserIds = new Set(data.visibleUsers.map((user) => user.id));
		if (data.reply && !visibleUserIds.has(data.reply.userId)) {
			const replyUser = replyUserForVisibility ?? (await fetchUserByIdOrFailFromDatabase(deps.db, data.reply.userId));
			data.visibleUsers.push(replyUser);
			visibleUserIds.add(replyUser.id);
		}
	}

	const countedMentionUserIds = new Set(finalMentionedUserIds);
	if (data.visibility === 'specified') {
		for (const visibleUser of data.visibleUsers ?? []) {
			countedMentionUserIds.add(visibleUser.id);
		}
	}
	const effectiveMentionCount =
		data.apMentionRawCount == null
			? countedMentionUserIds.size
			: data.apMentionRawCount +
				Array.from(countedMentionUserIds).filter((userId) => !resolvedApMentionUserIds.has(userId)).length;
	if (effectiveMentionCount > 0 && effectiveMentionCount > policies.mentionLimit) {
		throw new IdentifiableError('9f466dab-c856-48cd-9e65-ff90ff750580', 'Note contains too many mentions');
	}

	options.signal?.throwIfAborted();
	const persisted = await persist((db) => insertNote(deps, user, data, tags, emojis, finalMentionedUsers, silent, db));
	const awaited = persisted.outboxJobs.filter((job) => job.data.stage === 'fanout' || job.data.stage === 'antennas');
	const deferred = persisted.outboxJobs.filter((job) => job.data.stage !== 'fanout' && job.data.stage !== 'antennas');
	const context: NotePostCreateContext = {
		note: persisted.note,
		user,
		data,
		tags,
		mentionedUsers: finalMentionedUsers,
		silent,
	};
	const analytics: NoteAnalyticsEvent = {
		note: {
			id: persisted.note.id,
			userId: persisted.note.userId,
			userHost: persisted.note.userHost,
			visibility: persisted.note.visibility,
			replyId: persisted.note.replyId,
			renoteId: persisted.note.renoteId,
			fileIds: persisted.note.fileIds,
		},
		userHost: user.host,
		tags,
		silent,
	};
	if (options.reservation) {
		let requiredComplete = false;
		try {
			await runNotePostCreateBatch(deps, awaited, true, context);
			requiredComplete = true;
		} finally {
			// 保存済み作成イベントは一度だけ試行し、未完了の必須効果は outbox の回復へ残す。
			options.reservation.submit(deferredNotePostCreateTask(deps, requiredComplete ? deferred : [], analytics));
		}
	} else {
		await runNoteAnalytics(deps, analytics);
		await runNotePostCreateBatch(deps, awaited, true, context);
		await runNotePostCreateBatch(deps, deferred, false, context);
	}

	return persisted.note;
}

export async function fetchAndCreateNote(
	deps: NoteCreationDependencies,
	user: { id: MiUser['id']; username: string; host: MiUser['host']; isBot: boolean },
	data: {
		createdAt: Date;
		replyId: string | null;
		renoteId: string | null;
		fileIds: string[];
		text: string | null;
		cw: string | null;
		visibility: MiNote['visibility'];
		visibleUserIds: string[];
		channelId: string | null;
		localOnly: boolean;
		reactionAcceptance: MiNote['reactionAcceptance'];
		poll: IPoll | null;
		apMentions?: MiUser[] | null;
		apHashtags?: string[] | null;
		apEmojis?: string[] | null;
	},
	persist?: Parameters<typeof createNote>[4],
	options: Parameters<typeof createNote>[5] = {},
): Promise<MiNote> {
	const visibleUsers =
		data.visibleUserIds.length > 0
			? await listUsersByIdsFromDatabase(deps.db, data.visibleUserIds, { includeSuspended: true })
			: [];

	let files: MiDriveFile[] = [];
	if (data.fileIds.length > 0) {
		const found = await listDriveFilesByIdsFromDatabase(deps.db, data.fileIds);
		const map = new Map(found.filter((f) => f.userId === user.id).map((f) => [f.id, f]));
		files = data.fileIds.map((id) => map.get(id)).filter((f): f is MiDriveFile => f != null);
		if (files.length !== data.fileIds.length) {
			throw new IdentifiableError('b6992544-63e7-67f0-fa7f-32444b1b5306', 'Some files are not found.');
		}
	}

	let renote: MiNote | null = null;
	if (data.renoteId != null) {
		renote = await fetchNoteByIdFromDatabase(deps.db, data.renoteId);
		if (renote == null) {
			throw new IdentifiableError('b5c90186-4ab0-49c8-9bba-a1f76c282ba4', 'No such renote target.');
		}
		if (isRenote(renote) && !isQuote(renote)) {
			throw new IdentifiableError('fd4cc33e-2a37-48dd-99cc-9b806eb2031a', 'You can not Renote a pure Renote.');
		}

		if (renote.userId !== user.id) {
			const blocked = await blockingExistsInDatabase(deps.db, renote.userId, user.id);
			if (blocked) {
				throw new IdentifiableError('b390d7e1-8a5e-46ed-b625-06271cafd3d3', 'You have been blocked by this user.');
			}
		}

		if ((renote.visibility === 'followers' && renote.userId !== user.id) || renote.visibility === 'specified') {
			throw new IdentifiableError(
				'be9529e9-fe72-4de0-ae43-0b363c4938af',
				'You can not Renote due to target visibility.',
			);
		}

		if (renote.channelId && renote.channelId !== data.channelId) {
			const renoteChannel = await fetchChannelByIdFromDatabase(deps.db, renote.channelId);
			if (renoteChannel == null) {
				throw new IdentifiableError('b1653923-5453-4edc-b786-7c4f39bb0bbb', 'No such channel.');
			}
			if (!renoteChannel.allowRenoteToExternal) {
				throw new IdentifiableError('33510210-8452-094c-6227-4a6c05d99f00', 'Cannot renote outside of channel.');
			}
		}
	}

	let reply: MiNote | null = null;
	if (data.replyId != null) {
		reply = await fetchNoteByIdFromDatabase(deps.db, data.replyId);
		if (reply == null) {
			throw new IdentifiableError('749ee0f6-d3da-459a-bf02-282e2da4292c', 'No such reply target.');
		}
		if (isRenote(reply) && !isQuote(reply)) {
			throw new IdentifiableError('3ac74a84-8fd5-4bb0-870f-01804f82ce15', 'You can not reply to a pure Renote.');
		}
		if (!(await isVisibleForMeForApi(deps, reply, user.id))) {
			throw new IdentifiableError('b98980fa-3780-406c-a935-b6d0eeee10d1', 'You cannot reply to an invisible Note.');
		}
		if (reply.visibility === 'specified' && data.visibility !== 'specified') {
			throw new IdentifiableError(
				'ed940410-535c-4d5e-bfa3-af798671e93c',
				'You cannot reply to a specified visibility note with extended visibility.',
			);
		}

		if (reply.userId !== user.id) {
			const blocked = await blockingExistsInDatabase(deps.db, reply.userId, user.id);
			if (blocked) {
				throw new IdentifiableError('b390d7e1-8a5e-46ed-b625-06271cafd3d3', 'You have been blocked by this user.');
			}
		}
	}

	if (data.poll && data.poll.expiresAt != null && data.poll.expiresAt.getTime() < Date.now()) {
		throw new IdentifiableError('04da457d-b083-4055-9082-955525eda5a5', 'Poll is already expired.');
	}

	let channel: MiChannel | null = null;
	if (data.channelId != null) {
		channel = await fetchChannelByIdFromDatabase(deps.db, data.channelId);
		if (channel == null || channel.isArchived) {
			throw new IdentifiableError('b1653923-5453-4edc-b786-7c4f39bb0bbb', 'No such channel.');
		}
	}

	return await createNote(
		deps,
		user,
		omitUndefined({
			createdAt: data.createdAt,
			files,
			poll: data.poll,
			text: data.text,
			reply,
			renote,
			cw: data.cw,
			localOnly: data.localOnly,
			reactionAcceptance: data.reactionAcceptance,
			visibility: data.visibility,
			visibleUsers,
			channel,
			apMentions: data.apMentions,
			apHashtags: data.apHashtags,
			apEmojis: data.apEmojis,
		}),
		false,
		persist,
		options,
	);
}
