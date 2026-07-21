/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { domainToASCII } from 'node:url';
import * as mfm from 'mfm-js';
import type * as Redis from 'ioredis';
import { z } from 'zod';
import { DB_MAX_NOTE_TEXT_LENGTH, MAX_NOTE_TEXT_LENGTH } from '@/const.js';
import { misskeyId, uniqueItems } from '@/misc/zod-params.js';
import { extractCustomEmojisFromMfm } from '@/misc/extract-custom-emojis-from-mfm.js';
import { extractHashtags } from '@/misc/extract-hashtags.js';
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
import type { MiMeta } from '@/models/_.js';
import type { IPoll } from '@/models/Poll.js';
import type { IMentionedRemoteUsers, MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiChannel } from '@/models/Channel.js';
import { blockingExistsInDatabase } from '@/core/BlockingStore.js';
import { fetchChannelByIdFromDatabase, incrementChannelNotesCountAndUpdateLastNotedAtInDatabase, incrementChannelUsersCountInDatabase } from '@/core/ChannelStore.js';
import { listFollowerUserIdsByChannelIdFromDatabase } from '@/core/ChannelFollowingStore.js';
import { listDriveFilesByIdsFromDatabase } from '@/core/DriveFileStore.js';
import {
	listActiveLocalFollowerFollowingsByFolloweeIdFromDatabase,
	listFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabase,
	listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase,
	listNotificationFollowerIdsByFolloweeIdFromDatabase,
} from '@/core/FollowingStore.js';
import { recordHashtagUsagesInDatabase } from '@/core/HashtagStore.js';
import { adjustInstanceNotesCountFromDatabase, createInstanceInDatabase, fetchInstanceByHostFromDatabase } from '@/core/InstanceStore.js';
import {
	countNotesByUserIdAndChannelIdFromDatabase,
	createNoteInDatabase,
	createNoteWithPollInDatabase,
	fetchNoteByIdFromDatabase,
	incrementNoteRenoteCountInDatabase,
	incrementNoteRepliesCountInDatabase,
	listNotesByIdsFromDatabase,
} from '@/core/NoteStore.js';
import { listNoteThreadMutedUserIdsFromDatabase, noteThreadMutingExistsInDatabase } from '@/core/NoteThreadMutingStore.js';
import { listUserListIdsContainingUserFromDatabase, listUserListMembershipsForFanoutByUserIdFromDatabase } from '@/core/UserListMembershipStore.js';
import { listUserProfilesByUserIdsFromDatabase } from '@/core/UserProfileStore.js';
import {
	fetchUserByIdFromDatabase,
	fetchUserByIdOrFailFromDatabase,
	incrementUserNotesCountAndUpdatedAtInDatabase,
	listUsersByIdsFromDatabase,
	listUsersByUsernamesAndHostsFromDatabase,
} from '@/core/UserStore.js';
import { listMuterIdsByMuteeIdAndMuterIdsFromDatabase } from '@/core/MutingStore.js';
import { listRenoteMuterIdsByMuteeIdFromDatabase } from '@/core/RenoteMutingStore.js';
import type { EndedPollNotificationQueue, UserWebhookDeliverQueue } from '@/core/queues.js';
import type { UserWebhookDeliverJobData } from '@/queue/types.js';
import { listWebhooksFromDatabase } from '@/core/WebhookStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { addNoteToAntennasForHonoApi } from './antennas.js';
import { HonoApiError } from './error.js';
import { formatHashtagUsersWindow, getCurrentFeaturedWindow, HASHTAG_RANKING_WINDOW } from './hashtags.js';
import { deliverNoteActivityForHonoApi, deliverToRelaysForHonoApi, renderNoteOrRenoteActivityForHonoApi, resolveRemoteRecipientForHonoApi, type HonoApiNoteApDependencies, type HonoApiRelayDeliverDependencies } from './notes-ap.js';
import { createPackNoteHintsForUsersForHonoApi, createPackNoteStaticHintForHonoApi, packNoteForHonoApi, isVisibleForMeForHonoApi, type HonoApiNoteDependencies } from './note.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiNotification } from '@/models/Notification.js';
import { getHonoApiRolePolicies, getHonoApiUserRoles, type HonoApiRolePolicyDependencies } from './role-policy.js';
import { pushSwNotificationForHonoApi } from './push-notification.js';
import { packNotificationForHonoApi, type HonoApiNotificationsListDependencies } from './notifications-list.js';
import { xaddHonoApiNotifications, type HonoApiNotificationDependencies } from './notification.js';
import { packUserLiteForHonoApi } from './user.js';
import type { HonoApiAntennaStreamPublisher, HonoApiMainStreamPublisher, HonoApiNotesStreamPublisher, HonoApiRoleTimelineStreamPublisher } from './events.js';
import type { HonoChartWriters } from '../chart-runtime.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiNotesCreateDependencies =
	& HonoApiNoteDependencies
	& HonoApiNoteApDependencies
	& HonoApiRelayDeliverDependencies
	& HonoApiRolePolicyDependencies
	& HonoApiNotificationDependencies
	& {
		config: Config;
		meta: MiMeta;
		db: MiDrizzleDatabase;
		redis: Redis.Redis;
		redisForTimelines: Redis.Redis;
		chartWriters: HonoChartWriters;
		userWebhookDeliverQueue: UserWebhookDeliverQueue;
		endedPollNotificationQueue: EndedPollNotificationQueue;
		publishNotesStream?: HonoApiNotesStreamPublisher;
		publishMainStream?: HonoApiMainStreamPublisher;
		publishAntennaStream?: HonoApiAntennaStreamPublisher;
		publishRoleTimelineStream?: HonoApiRoleTimelineStreamPublisher;
	};

function isSilencedHostForHonoApi(silencedHosts: string[] | undefined, host: string | null): boolean {
	if (!silencedHosts || host == null) return false;
	const lowerHost = host.toLowerCase();
	return silencedHosts.some(target => `.${lowerHost}`.endsWith(`.${target}`));
}

function isMediaSilencedHostForHonoApi(silencedHosts: string[] | undefined, host: string | null): boolean {
	if (!silencedHosts || host == null) return false;
	return silencedHosts.some(x => host.toLowerCase() === x);
}

function concatNoteContentsForKeyWordCheck(content: { cw?: string | null; text?: string | null; pollChoices?: string[] | null; others?: string[] | null }): string {
	return `${content.cw ?? ''}${content.text ?? ''}\n${(content.pollChoices ?? []).join('\n')}\n${(content.others ?? []).join('\n')}`;
}

export function isKeyWordIncludedForHonoApi(text: string, keyWords: string[]): boolean {
	if (keyWords.length === 0) return false;
	if (text === '') return false;

	const regexpregexp = /^\/(.+)\/(.*)$/;

	return keyWords.some(filter => {
		const regexp = filter.match(regexpregexp);
		if (!regexp) {
			const words = filter.split(' ');
			return words.every(keyword => text.includes(keyword));
		}
		try {
			const [, pattern, flags] = regexp;
			if (pattern == null || flags == null) return false;
			return new RegExp(pattern, flags).test(text);
		} catch {
			return false;
		}
	});
}

/** HashtagService#updateHashtagsRanking 相当。hashtags は normalizeForSearch 済みで渡すこと。 */
export async function updateHashtagsRankingsForHonoApi(
	deps: { meta: Pick<MiMeta, 'hiddenTags' | 'sensitiveWords'>; redis: Redis.Redis },
	hashtags: string[],
	userId: MiUser['id'],
): Promise<void> {
	const hiddenTags = new Set(deps.meta.hiddenTags.map(tag => normalizeForSearch(tag)));
	const candidates = [...new Set(hashtags)].filter(hashtag =>
		!hiddenTags.has(hashtag) && !isKeyWordIncludedForHonoApi(hashtag, deps.meta.sensitiveWords));
	if (candidates.length === 0) return;

	const checkPipeline = deps.redis.pipeline();
	for (const hashtag of candidates) {
		checkPipeline.sismember(`hashtagUsers:${hashtag}`, userId);
	}
	const checkResults = await checkPipeline.exec();
	if (checkResults == null) throw new Error('Failed to check hashtag ranking users');
	const hashtagsToUpdate: string[] = [];
	for (let i = 0; i < checkResults.length; i++) {
		const [error, exists] = checkResults[i]!;
		if (error != null) throw error;
		if (exists !== 1) hashtagsToUpdate.push(candidates[i]!);
	}
	if (hashtagsToUpdate.length === 0) return;

	// YYYYMMDDHHmm (10分間隔)
	const now = new Date();
	now.setMinutes(Math.floor(now.getMinutes() / 10) * 10, 0, 0);
	const window = formatHashtagUsersWindow(now);
	const currentFeaturedWindow = getCurrentFeaturedWindow(HASHTAG_RANKING_WINDOW);
	const redisPipeline = deps.redis.pipeline();
	for (const hashtag of hashtagsToUpdate) {
		redisPipeline.zincrby(`featuredHashtagsRanking:${currentFeaturedWindow}`, 1, hashtag);
		redisPipeline.expire(
			`featuredHashtagsRanking:${currentFeaturedWindow}`,
			(HASHTAG_RANKING_WINDOW * 3) / 1000,
			'NX',
		);
		redisPipeline.pfadd(`hashtagUsers:${hashtag}:${window}`, userId);
		redisPipeline.expire(`hashtagUsers:${hashtag}:${window}`, 60 * 60 * 24 * 3, 'NX');
		redisPipeline.sadd(`hashtagUsers:${hashtag}`, userId);
		redisPipeline.expire(`hashtagUsers:${hashtag}`, 60 * 60, 'NX');
	}
	await redisPipeline.exec();
}

export async function updateHashtagsRankingForHonoApi(
	deps: { meta: Pick<MiMeta, 'hiddenTags' | 'sensitiveWords'>; redis: Redis.Redis },
	hashtag: string,
	userId: MiUser['id'],
): Promise<void> {
	await updateHashtagsRankingsForHonoApi(deps, [hashtag], userId);
}

function noSuchRenoteTargetError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such renote target.', code: 'NO_SUCH_RENOTE_TARGET', id: 'b5c90186-4ab0-49c8-9bba-a1f76c282ba4' });
}
function cannotReRenoteError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'You can not Renote a pure Renote.', code: 'CANNOT_RENOTE_TO_A_PURE_RENOTE', id: 'fd4cc33e-2a37-48dd-99cc-9b806eb2031a' });
}
function cannotRenoteDueToVisibilityError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'You can not Renote due to target visibility.', code: 'CANNOT_RENOTE_DUE_TO_VISIBILITY', id: 'be9529e9-fe72-4de0-ae43-0b363c4938af' });
}
function noSuchReplyTargetError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such reply target.', code: 'NO_SUCH_REPLY_TARGET', id: '749ee0f6-d3da-459a-bf02-282e2da4292c' });
}
function cannotReplyToInvisibleNoteError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'You cannot reply to an invisible Note.', code: 'CANNOT_REPLY_TO_AN_INVISIBLE_NOTE', id: 'b98980fa-3780-406c-a935-b6d0eeee10d1' });
}
function cannotReplyToPureRenoteError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'You can not reply to a pure Renote.', code: 'CANNOT_REPLY_TO_A_PURE_RENOTE', id: '3ac74a84-8fd5-4bb0-870f-01804f82ce15' });
}
function cannotReplyToSpecifiedVisibilityNoteWithExtendedVisibilityError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'You cannot reply to a specified visibility note with extended visibility.', code: 'CANNOT_REPLY_TO_SPECIFIED_VISIBILITY_NOTE_WITH_EXTENDED_VISIBILITY', id: 'ed940410-535c-4d5e-bfa3-af798671e93c' });
}
function cannotCreateAlreadyExpiredPollError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Poll is already expired.', code: 'CANNOT_CREATE_ALREADY_EXPIRED_POLL', id: '04da457d-b083-4055-9082-955525eda5a5' });
}
function noSuchChannelError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such channel.', code: 'NO_SUCH_CHANNEL', id: 'b1653923-5453-4edc-b786-7c4f39bb0bbb' });
}
function youHaveBeenBlockedError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'You have been blocked by this user.', code: 'YOU_HAVE_BEEN_BLOCKED', id: 'b390d7e1-8a5e-46ed-b625-06271cafd3d3' });
}
function noSuchFileError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Some files are not found.', code: 'NO_SUCH_FILE', id: 'b6992544-63e7-67f0-fa7f-32444b1b5306' });
}
function cannotRenoteOutsideOfChannelError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Cannot renote outside of channel.', code: 'CANNOT_RENOTE_OUTSIDE_OF_CHANNEL', id: '33510210-8452-094c-6227-4a6c05d99f00' });
}
function containsProhibitedWordsError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Cannot post because it contains prohibited words.', code: 'CONTAINS_PROHIBITED_WORDS', id: 'aa6e01d3-a85c-669d-758a-76aab43af334' });
}
function containsTooManyMentionsError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Cannot post because it exceeds the allowed number of mentions.', code: 'CONTAINS_TOO_MANY_MENTIONS', id: '4de0363a-3046-481b-9b0f-feff3e211025' });
}

async function extractMentionedUsersForHonoApi(deps: HonoApiNotesCreateDependencies, user: { host: MiUser['host'] }, tokens: mfm.MfmNode[]): Promise<MiUser[]> {
	if (tokens == null) return [];
	const mentions = mfm.extractMentions(tokens);
	const accounts = mentions.map(mention => {
		const host = mention.host ?? user.host;
		return {
			username: mention.username.toLowerCase(),
			host: host == null ? null : domainToASCII(host.toLowerCase()),
		};
	});
	const users = await listUsersByUsernamesAndHostsFromDatabase(deps.db, accounts).catch(() => []);
	const userByAccount = new Map(users.map(resolved => [`${resolved.username.toLowerCase()}@${resolved.host ?? ''}`, resolved]));
	const seenUserIds = new Set<MiUser['id']>();
	const resolvedUsers: MiUser[] = [];
	for (const account of accounts) {
		const resolved = userByAccount.get(`${account.username}@${account.host ?? ''}`);
		if (resolved == null || seenUserIds.has(resolved.id)) continue;
		seenUserIds.add(resolved.id);
		resolvedUsers.push(resolved);
	}
	return resolvedUsers;
}

function pushFanoutTimelineForHonoApi(deps: HonoApiNotesCreateDependencies, tl: string, id: string, maxlen: number, pipeline: Redis.ChainableCommander): void {
	const date = parseId(id).date;
	if (date.getTime() > Date.now() - 1000 * 60 * 3) {
		pipeline.lpush('list:' + tl, id);
		if (Math.random() < 0.1) {
			pipeline.ltrim('list:' + tl, 0, maxlen - 1);
		}
	} else {
		deps.redisForTimelines.lindex('list:' + tl, -1).then(lastId => {
			if (lastId == null || date.getTime() > parseId(lastId).date.getTime()) {
				deps.redisForTimelines.lpush('list:' + tl, id);
			}
		});
	}
}

type NoteNotificationType = 'mention' | 'reply' | 'renote' | 'quote' | 'note' | 'reaction';

type NoteNotificationRequest = {
	notifieeId: MiUser['id'];
	type: NoteNotificationType;
	extra: Record<string, unknown>;
};

async function hydrateNotificationNoteRelationsForHonoApi(
	deps: HonoApiNotificationDependencies & HonoApiNotificationsListDependencies,
	notes: MiNote[],
): Promise<MiNote[]> {
	const roots = notes.map(note => ({ ...note }) as MiNote);
	const noteById = new Map<MiNote['id'], MiNote>(roots.map(note => [note.id, note]));
	const register = (note: MiNote): MiNote => {
		const existing = noteById.get(note.id);
		if (existing != null) return existing;
		const cloned = { ...note } as MiNote;
		noteById.set(cloned.id, cloned);
		return cloned;
	};
	const expanded = new Set<MiNote['id']>();
	let detailFrontier = roots;
	while (detailFrontier.length > 0) {
		const current = detailFrontier.filter(note => !expanded.has(note.id));
		if (current.length === 0) break;
		for (const note of current) {
			expanded.add(note.id);
			if (note.reply) note.reply = register(note.reply);
			if (note.renote) note.renote = register(note.renote);
		}

		const missingIds = [...new Set(current.flatMap(note => [note.replyId, note.renoteId])
			.filter((id): id is MiNote['id'] => id != null && !noteById.has(id)))];
		for (const relation of await listNotesByIdsFromDatabase(deps.db, missingIds)) {
			register(relation);
		}

		const nextFrontier: MiNote[] = [];
		for (const note of current) {
			if (note.replyId) note.reply = noteById.get(note.replyId) ?? null;
			if (note.renoteId) {
				note.renote = noteById.get(note.renoteId) ?? null;
				if (note.renote != null) nextFrontier.push(note.renote);
			}
		}
		detailFrontier = nextFrontier;
	}

	return roots;
}

export async function createNoteNotificationsForHonoApi(
	deps: HonoApiNotificationDependencies & HonoApiNotificationsListDependencies,
	notifierId: MiUser['id'],
	requests: readonly NoteNotificationRequest[],
): Promise<void> {
	const pending = requests.filter(request => request.notifieeId !== notifierId);
	if (pending.length === 0) return;

	const notifieeIds = [...new Set(pending.map(request => request.notifieeId))];
	const [profiles, muterIds] = await Promise.all([
		listUserProfilesByUserIdsFromDatabase(deps.db, notifieeIds),
		listMuterIdsByMuteeIdAndMuterIdsFromDatabase(deps.db, notifierId, notifieeIds),
	]);
	const profileByUserId = new Map(profiles.map(profile => [profile.userId, profile]));
	const muterIdSet = new Set(muterIds);
	const candidates = pending.map(request => {
		const profile = profileByUserId.get(request.notifieeId);
		return {
			request,
			profile,
			receiveConfig: profile?.notificationRecieveConfig[request.type],
		};
	}).filter(candidate => candidate.receiveConfig?.type !== 'never' && !muterIdSet.has(candidate.request.notifieeId));
	if (candidates.length === 0) return;

	const notifieeFollowingCandidateIds = [...new Set(candidates
		.filter(candidate => candidate.receiveConfig?.type === 'following' || candidate.receiveConfig?.type === 'mutualFollow' || candidate.receiveConfig?.type === 'followingOrFollower')
		.map(candidate => candidate.request.notifieeId))];
	const notifierFollowingCandidateIds = [...new Set(candidates
		.filter(candidate => candidate.receiveConfig?.type === 'follower' || candidate.receiveConfig?.type === 'mutualFollow' || candidate.receiveConfig?.type === 'followingOrFollower')
		.map(candidate => candidate.request.notifieeId))];
	const candidateUserListIds = [...new Set(candidates.flatMap(candidate => candidate.receiveConfig?.type === 'list'
		? [candidate.receiveConfig.userListId]
		: []))];
	const [notifieeFollowingNotifierIds, notifierFollowingNotifieeIds, memberUserListIds] = await Promise.all([
		listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase(deps.db, notifierId, notifieeFollowingCandidateIds),
		listFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabase(deps.db, notifierId, notifierFollowingCandidateIds),
		listUserListIdsContainingUserFromDatabase(deps.db, notifierId, candidateUserListIds),
	]);
	const notifieeFollowingNotifierIdSet = new Set(notifieeFollowingNotifierIds);
	const notifierFollowingNotifieeIdSet = new Set(notifierFollowingNotifieeIds);

	const accepted = candidates.filter(candidate => {
		const config = candidate.receiveConfig;
		const notifieeId = candidate.request.notifieeId;
		if (config?.type === 'following') return notifieeFollowingNotifierIdSet.has(notifieeId);
		if (config?.type === 'follower') return notifierFollowingNotifieeIdSet.has(notifieeId);
		if (config?.type === 'mutualFollow') return notifieeFollowingNotifierIdSet.has(notifieeId) && notifierFollowingNotifieeIdSet.has(notifieeId);
		if (config?.type === 'followingOrFollower') return notifieeFollowingNotifierIdSet.has(notifieeId) || notifierFollowingNotifieeIdSet.has(notifieeId);
		if (config?.type === 'list') return memberUserListIds.has(config.userListId);
		return true;
	});
	if (accepted.length === 0) return;

	const stored = accepted.map(candidate => ({
		...candidate,
		notification: {
			id: genId(),
			createdAt: new Date().toISOString(),
			type: candidate.request.type,
			notifierId,
			...candidate.request.extra,
		},
	}));
	await xaddHonoApiNotifications(deps, stored.map(item => ({
		userId: item.request.notifieeId,
		notification: item.notification,
	})));

	const notifier = await fetchUserByIdFromDatabase(deps.db, notifierId);
	if (notifier == null || notifier.isSuspended) return;
	const publishable = stored.filter(item => notifier.host == null || !item.profile?.mutedInstances.includes(notifier.host));
	if (publishable.length === 0) return;

	const noteIds = [...new Set(publishable
		.map(item => 'noteId' in item.notification ? item.notification.noteId : null)
		.filter((noteId): noteId is string => typeof noteId === 'string'))];
	const fetchedNotes = await listNotesByIdsFromDatabase(deps.db, noteIds);
	if (fetchedNotes.length === 0) return;
	const notes = await hydrateNotificationNoteRelationsForHonoApi(deps, fetchedNotes);
	const notePackHint = await createPackNoteStaticHintForHonoApi(deps, notes);
	const packedNotifier = notePackHint.packedUsers.get(notifier.id) ?? await packUserLiteForHonoApi(deps, notifier).catch(() => null);
	if (packedNotifier == null) return;
	const packedUsers = new Map([[notifier.id, packedNotifier]]);
	const noteSources = new Map(notes.map(note => [note.id, note]));

	const batchSize = 1000;
	for (let offset = 0; offset < publishable.length; offset += batchSize) {
		const batch = publishable.slice(offset, offset + batchSize);
		const notePackHintsByUserId = await createPackNoteHintsForUsersForHonoApi(
			deps,
			notes,
			batch.map(item => item.request.notifieeId),
			{ staticHint: notePackHint },
		);
		await Promise.all(batch.map(async item => {
			const packed = await packNotificationForHonoApi(
				deps,
				item.notification as unknown as MiNotification,
				item.request.notifieeId,
				{ checkValidNotifier: false },
				{ packedUsers, noteSources, notePackHint: notePackHintsByUserId.get(item.request.notifieeId) ?? notePackHint },
			);
			if (packed != null) {
				deps.publishMainStream?.(item.request.notifieeId, 'notification', packed);
				void pushSwNotificationForHonoApi(deps, item.request.notifieeId, 'notification', packed);
			}
		}));
	}
}

export async function createNoteNotificationForHonoApi(
	deps: HonoApiNotificationDependencies & HonoApiNotificationsListDependencies,
	notifieeId: MiUser['id'],
	notifierId: MiUser['id'],
	type: NoteNotificationType,
	extra: Record<string, unknown>,
): Promise<void> {
	await createNoteNotificationsForHonoApi(deps, notifierId, [{ notifieeId, type, extra }]);
}

type NotificationType = 'reply' | 'renote' | 'quote' | 'mention';

class HonoNotificationManager {
	private queue = new Map<MiUser['id'], { target: MiUser['id']; reason: NotificationType }>();

	constructor(private notifier: { id: MiUser['id'] }, private note: MiNote) {}

	push(notifiee: MiUser['id'], reason: NotificationType): void {
		if (this.notifier.id === notifiee) return;
		const exist = this.queue.get(notifiee);
		if (exist) {
			if (reason !== 'mention') exist.reason = reason;
		} else {
			this.queue.set(notifiee, { reason, target: notifiee });
		}
	}

	async notify(deps: HonoApiNotesCreateDependencies): Promise<void> {
		if (this.queue.size === 0) return;

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
			if (!isVisibleToTarget) continue;

			if (x.reason === 'renote') {
				requests.push({ notifieeId: x.target, type: 'renote', extra: { noteId: this.note.id, targetNoteId: this.note.renoteId! } });
			} else {
				requests.push({ notifieeId: x.target, type: x.reason, extra: { noteId: this.note.id } });
			}
		}
		await createNoteNotificationsForHonoApi(deps, this.notifier.id, requests);
	}
}

export async function fetchOrRegisterInstanceForHonoApi(deps: { db: MiDrizzleDatabase }, host: string): Promise<{ id: string; host: string }> {
	const puny = domainToASCII(host.toLowerCase());
	const existing = await fetchInstanceByHostFromDatabase(deps.db, puny);
	if (existing != null) return existing;

	try {
		return await createInstanceInDatabase(deps.db, {
			id: genId(),
			host: puny,
			firstRetrievedAt: new Date(),
		});
	} catch (err) {
		if (isDuplicateKeyValueError(err)) {
			const raced = await fetchInstanceByHostFromDatabase(deps.db, puny);
			if (raced != null) return raced;
		}
		throw err;
	}
}

async function enqueueUserWebhookForHonoApi(
	deps: HonoApiNotesCreateDependencies,
	userId: MiUser['id'],
	type: 'note' | 'reply' | 'renote' | 'mention',
	note: unknown,
): Promise<void> {
	const webhooks = await listWebhooksFromDatabase(deps.db, { userId, isActive: true, on: [type] });

	await Promise.all(webhooks.map(webhook => {
		const data: UserWebhookDeliverJobData = {
			type,
			content: { note } as UserWebhookDeliverJobData['content'],
			webhookId: webhook.id,
			userId: webhook.userId,
			to: webhook.url,
			secret: webhook.secret,
			createdAt: Date.now(),
			eventId: randomUUID(),
		};

		return deps.userWebhookDeliverQueue.add(webhook.id, data, {
			attempts: 4,
			backoff: { type: 'custom' },
			...queueRetentionOptions(deps.config),
		});
	}));
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

function isRenoteData(data: CreateNoteData): data is CreateNoteData & { renote: MiNote } {
	return data.renote != null;
}

function isQuoteData(data: CreateNoteData & { renote: MiNote }): boolean {
	return data.text != null || data.reply != null || data.cw != null || data.poll != null || (data.files != null && data.files.length > 0);
}

export async function insertNoteForHonoApi(
	deps: HonoApiNotesCreateDependencies,
	user: { id: MiUser['id']; host: MiUser['host'] },
	data: CreateNoteData,
	tags: string[],
	emojis: string[],
	mentionedUsers: MiUser[],
	db: MiDrizzleDatabase = deps.db,
): Promise<MiNote> {
	const insert: Parameters<typeof createNoteInDatabase>[1] = {
		id: genId(data.createdAt?.getTime()),
		uri: data.uri ?? null,
		url: data.url ?? null,
		fileIds: data.files.map(f => f.id),
		replyId: data.reply ? data.reply.id : null,
		renoteId: data.renote ? data.renote.id : null,
		channelId: data.channel ? data.channel.id : null,
		threadId: data.reply ? (data.reply.threadId ?? data.reply.id) : null,
		name: data.name,
		text: data.text,
		hasPoll: data.poll != null,
		cw: data.cw ?? null,
		tags: tags.map(t => normalizeForSearch(t)),
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
		visibleUserIds: data.visibility === 'specified' ? (data.visibleUsers ? data.visibleUsers.map(u => u.id) : []) : [],
		mentions: [],
		mentionedRemoteUsers: '[]',
		attachedFileTypes: data.files.map(f => f.type),
		replyUserId: data.reply ? data.reply.userId : null,
		replyUserHost: data.reply ? data.reply.userHost : null,
		renoteUserId: data.renote ? data.renote.userId : null,
		renoteUserHost: data.renote ? data.renote.userHost : null,
		renoteChannelId: data.renote ? data.renote.channelId : null,
		userHost: user.host,
	};

	if (mentionedUsers.length > 0) {
		insert.mentions = mentionedUsers.map(u => u.id);
		const profiles = await listUserProfilesByUserIdsFromDatabase(db, mentionedUsers.map(u => u.id));
		const profileByUserId = new Map(profiles.map(profile => [profile.userId, profile]));
		insert.mentionedRemoteUsers = JSON.stringify(mentionedUsers.filter((u): u is MiUser & { host: string } => u.host != null).map(u => {
			const profile = profileByUserId.get(u.id);
			return { uri: u.uri, url: profile?.url ?? undefined, username: u.username, host: u.host } as IMentionedRemoteUsers[0];
		}));
	}

	try {
		if (data.poll != null) {
			await createNoteWithPollInDatabase(db, insert, {
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
		} else {
			await createNoteInDatabase(db, insert);
		}

		return { ...insert, reply: data.reply ?? null, renote: data.renote ?? null } as unknown as MiNote;
	} catch (err) {
		if (isDuplicateKeyValueError(err)) {
			const e = new Error('Duplicated note');
			e.name = 'duplicated';
			throw e;
		}
		throw err;
	}
}

export async function postNoteCreatedForHonoApi(
	deps: HonoApiNotesCreateDependencies,
	note: MiNote,
	user: { id: MiUser['id']; username: string; host: MiUser['host']; isBot: boolean },
	data: CreateNoteData,
	tags: string[],
	mentionedUsers: MiUser[],
	silent = false,
): Promise<void> {
	void deps.chartWriters.notesChart.update(note, true);
	if (note.visibility !== 'specified' && (deps.meta.enableChartsForRemoteUser || user.host == null)) {
		deps.chartWriters.perUserNotesChart.update(user, note, true);
	}

	if (deps.meta.enableStatsForFederatedInstances && user.host != null) {
		fetchOrRegisterInstanceForHonoApi(deps, user.host).then(async i => {
			await adjustInstanceNotesCountFromDatabase(deps.db, i.id, 1);
			if (deps.meta.enableChartsForFederatedInstances) {
				void deps.chartWriters.instanceChart.updateNote(i.host, note, true);
			}
		}).catch(() => {});
	}

	if (data.visibility === 'public' || data.visibility === 'home') {
		const names = [...new Set(tags.map(tag => normalizeForSearch(tag)))];
		// 原典 HashtagService#updateHashtag 同様、ランキング更新は fire-and-forget。
		void updateHashtagsRankingsForHonoApi(deps, names, user.id).catch(() => {});
		await recordHashtagUsagesInDatabase(deps.db, {
			entries: names.map(name => ({ id: genId(), name })),
			userId: user.id,
			isLocalUser: user.host == null,
			isRemoteUser: user.host != null,
			isUserAttached: false,
			increment: true,
		});
	}

	await incrementUserNotesCountAndUpdatedAtInDatabase(deps.db, user.id, new Date());

	if (deps.meta.enableFanoutTimeline) {
		await pushNoteToFanoutTimelinesForHonoApi(deps, note, user);
	}

	// アンテナへのマッチングは enableFanoutTimeline に関わらず常時実行する。
	await addNoteToAntennasForHonoApi(deps, { ...note, channel: data.channel ?? null }, user);

	if (data.reply) {
		await incrementNoteRepliesCountInDatabase(deps.db, data.reply.id, 1);
	}

	if (data.reply == null) {
		const followerIds = await listNotificationFollowerIdsByFolloweeIdFromDatabase(deps.db, user.id);
		if (note.visibility !== 'specified') {
			const isPureRenote = isRenoteData(data) && !isQuoteData(data);
			const renoteMuterIds = isPureRenote
				? new Set(await listRenoteMuterIdsByMuteeIdFromDatabase(deps.db, user.id))
				: null;
			const requests = followerIds
				.filter(followerId => !renoteMuterIds?.has(followerId))
				.map(followerId => ({ notifieeId: followerId, type: 'note' as const, extra: { noteId: note.id } }));
			await createNoteNotificationsForHonoApi(deps, user.id, requests);
		}
	}

	if (data.renote && data.renote.userId !== user.id && !user.isBot) {
		await incrementNoteRenoteCountInDatabase(deps.db, data.renote.id, 1);
	}

	if (data.poll && data.poll.expiresAt) {
		const delay = data.poll.expiresAt.getTime() - Date.now();
		await deps.endedPollNotificationQueue.add(note.id, { noteId: note.id }, {
			delay,
			...queueRetentionOptions(deps.config),
		});
	}

	if (!silent) {
		if (user.host == null) {
			void deps.chartWriters.activeUsersChart.write(user as { id: string; host: null });
		}

		const noteObj = await packNoteForHonoApi(deps, note, null, { skipHide: true, withReactionAndUserPairCache: true });

		deps.publishNotesStream?.(noteObj);

		// 投稿者の保持ロールのタイムラインへ配信する。
		await addNoteToRoleTimelinesForHonoApi(deps, noteObj);

		await enqueueUserWebhookForHonoApi(deps, user.id, 'note', noteObj);

		const nm = new HonoNotificationManager(user, note);

		// スレッドミュート判定はメンション先ローカルユーザー全員分を1クエリで引き、
		// pack + 配信はユーザー毎に独立なので並列化する (原典は直列 await)。
		const localMentionedUsers = mentionedUsers.filter(u => u.host == null);
		const threadMutedUserIds = new Set(await listNoteThreadMutedUserIdsFromDatabase(deps.db, note.threadId ?? note.id, localMentionedUsers.map(u => u.id)));
		await Promise.all(localMentionedUsers.filter(u => !threadMutedUserIds.has(u.id)).map(async u => {
			const detailPackedNote = await packNoteForHonoApi(deps, note, u, { detail: true });
			deps.publishMainStream?.(u.id, 'mention', detailPackedNote);
			await enqueueUserWebhookForHonoApi(deps, u.id, 'mention', detailPackedNote);
			nm.push(u.id, 'mention');
		}));

		if (data.reply) {
			if (data.reply.userHost === null) {
				const isThreadMuted = await noteThreadMutingExistsInDatabase(deps.db, data.reply.userId, data.reply.threadId ?? data.reply.id);
				if (!isThreadMuted) {
					nm.push(data.reply.userId, 'reply');
					deps.publishMainStream?.(data.reply.userId, 'reply', noteObj);
					await enqueueUserWebhookForHonoApi(deps, data.reply.userId, 'reply', noteObj);
				}
			}
		}

		if (isRenoteData(data)) {
			const type = isQuoteData(data) ? 'quote' : 'renote';
			if (data.renote.userHost === null) {
				nm.push(data.renote.userId, type);
			}
			if (user.id !== data.renote.userId && data.renote.userHost === null) {
				deps.publishMainStream?.(data.renote.userId, 'renote', noteObj);
				await enqueueUserWebhookForHonoApi(deps, data.renote.userId, 'renote', noteObj);
			}
		}

		await nm.notify(deps);

		if (!data.localOnly && user.host == null) {
			const activity = await renderNoteOrRenoteActivityForHonoApi(deps, {
					localOnly: data.localOnly,
					renote: data.renote,
					isQuote: isRenoteData(data) && isQuoteData(data),
			}, note);

			const recipientUsers = note.visibility === 'specified' ? (data.visibleUsers ?? []) : mentionedUsers;
			const directRecipients = (await Promise.all(recipientUsers.filter(u => u.host != null).map(u => resolveRemoteRecipientForHonoApi(deps, u.id)))).filter((u): u is NonNullable<typeof u> => u != null);

			if (data.reply && data.reply.userHost !== null) {
				const u = await resolveRemoteRecipientForHonoApi(deps, data.reply.userId);
				if (u) directRecipients.push(u);
			}
			if (data.renote && data.renote.userHost !== null) {
				const u = await resolveRemoteRecipientForHonoApi(deps, data.renote.userId);
				if (u) directRecipients.push(u);
			}

			await deliverNoteActivityForHonoApi(deps, user, activity, {
				directRecipients,
				deliverToFollowers: ['public', 'home', 'followers'].includes(note.visibility),
			});

			if (note.visibility === 'public') {
				await deliverToRelaysForHonoApi(deps, { id: user.id, host: null }, activity);
			}
		}
	}

	if (data.channel) {
		await incrementChannelNotesCountAndUpdateLastNotedAtInDatabase(deps.db, data.channel.id, new Date());
		const count = await countNotesByUserIdAndChannelIdFromDatabase(deps.db, user.id, data.channel.id);
		if (count === 1) await incrementChannelUsersCountInDatabase(deps.db, data.channel.id);
	}
}

/** RoleService.addNoteToRoleTimeline 相当。投稿者の保持ロール (コンディショナル含む) のタイムラインへfanoutし、roleTimelineStream を配信する。 */
async function addNoteToRoleTimelinesForHonoApi(deps: HonoApiNotesCreateDependencies, noteObj: Packed<'Note'>): Promise<void> {
	// コンディショナルロール評価には full MiUser が必要 (呼び出し元は部分型しか持たない) のためここでフェッチする。
	const user = await fetchUserByIdOrFailFromDatabase(deps.db, noteObj.userId);
	const roles = await getHonoApiUserRoles(deps, user);
	if (roles.length === 0) return;

	const r = deps.redisForTimelines.pipeline();
	for (const role of roles) {
		pushFanoutTimelineForHonoApi(deps, `roleTimeline:${role.id}`, noteObj.id, 1000, r);
		deps.publishRoleTimelineStream?.(role.id, 'note', noteObj);
	}
	await r.exec();
}

async function pushNoteToFanoutTimelinesForHonoApi(deps: HonoApiNotesCreateDependencies, note: MiNote, user: { id: MiUser['id']; host: MiUser['host'] }): Promise<void> {
	const r = deps.redisForTimelines.pipeline();

	if (note.channelId) {
		pushFanoutTimelineForHonoApi(deps, `channelTimeline:${note.channelId}`, note.id, deps.config.limits.channelTimelineNotes, r);
		pushFanoutTimelineForHonoApi(deps, `userTimelineWithChannel:${user.id}`, note.id, note.userHost == null ? deps.meta.perLocalUserUserTimelineCacheMax : deps.meta.perRemoteUserUserTimelineCacheMax, r);

		const channelFollowerIds = await listFollowerUserIdsByChannelIdFromDatabase(deps.db, note.channelId);
		for (const followerId of channelFollowerIds) {
			pushFanoutTimelineForHonoApi(deps, `homeTimeline:${followerId}`, note.id, deps.meta.perUserHomeTimelineCacheMax, r);
			if (note.fileIds.length > 0) {
				pushFanoutTimelineForHonoApi(deps, `homeTimelineWithFiles:${followerId}`, note.id, deps.meta.perUserHomeTimelineCacheMax / 2, r);
			}
		}
	} else {
		let [followings, userListMemberships] = await Promise.all([
			listActiveLocalFollowerFollowingsByFolloweeIdFromDatabase(deps.db, user.id),
			listUserListMembershipsForFanoutByUserIdFromDatabase(deps.db, user.id),
		]);
		const followerIdSet = new Set(followings.map(following => following.followerId));
		const visibleUserIdSet = new Set(note.visibleUserIds);

		if (note.visibility === 'followers') {
			userListMemberships = userListMemberships.filter(x => x.userListUserId === user.id || followerIdSet.has(x.userListUserId));
		}

		for (const following of followings) {
			if (note.visibility === 'specified' && !visibleUserIdSet.has(following.followerId)) continue;
			if (isReply(note, following.followerId) && !following.withReplies) continue;

			pushFanoutTimelineForHonoApi(deps, `homeTimeline:${following.followerId}`, note.id, deps.meta.perUserHomeTimelineCacheMax, r);
			if (note.fileIds.length > 0) {
				pushFanoutTimelineForHonoApi(deps, `homeTimelineWithFiles:${following.followerId}`, note.id, deps.meta.perUserHomeTimelineCacheMax / 2, r);
			}
		}

		for (const membership of userListMemberships) {
			if (note.visibility === 'specified' && note.userId !== membership.userListUserId && !visibleUserIdSet.has(membership.userListUserId)) continue;
			if (isReply(note, membership.userListUserId) && !membership.withReplies) continue;

			pushFanoutTimelineForHonoApi(deps, `userListTimeline:${membership.userListId}`, note.id, deps.meta.perUserListTimelineCacheMax, r);
			if (note.fileIds.length > 0) {
				pushFanoutTimelineForHonoApi(deps, `userListTimelineWithFiles:${membership.userListId}`, note.id, deps.meta.perUserListTimelineCacheMax / 2, r);
			}
		}

		if (note.userHost == null) {
			if (note.visibility !== 'specified' || !visibleUserIdSet.has(user.id)) {
				pushFanoutTimelineForHonoApi(deps, `homeTimeline:${user.id}`, note.id, deps.meta.perUserHomeTimelineCacheMax, r);
				if (note.fileIds.length > 0) {
					pushFanoutTimelineForHonoApi(deps, `homeTimelineWithFiles:${user.id}`, note.id, deps.meta.perUserHomeTimelineCacheMax / 2, r);
				}
			}
		}

		if (isReply(note)) {
			pushFanoutTimelineForHonoApi(deps, `userTimelineWithReplies:${user.id}`, note.id, note.userHost == null ? deps.meta.perLocalUserUserTimelineCacheMax : deps.meta.perRemoteUserUserTimelineCacheMax, r);
			if (note.visibility === 'public' && note.userHost == null) {
				pushFanoutTimelineForHonoApi(deps, 'localTimelineWithReplies', note.id, 300, r);
				if (note.replyUserHost == null) {
					pushFanoutTimelineForHonoApi(deps, `localTimelineWithReplyTo:${note.replyUserId}`, note.id, 300 / 10, r);
				}
			}
		} else {
			pushFanoutTimelineForHonoApi(deps, `userTimeline:${user.id}`, note.id, note.userHost == null ? deps.meta.perLocalUserUserTimelineCacheMax : deps.meta.perRemoteUserUserTimelineCacheMax, r);
			if (note.fileIds.length > 0) {
				pushFanoutTimelineForHonoApi(deps, `userTimelineWithFiles:${user.id}`, note.id, note.userHost == null ? deps.meta.perLocalUserUserTimelineCacheMax / 2 : deps.meta.perRemoteUserUserTimelineCacheMax / 2, r);
			}
			if (note.visibility === 'public' && note.userHost == null) {
				pushFanoutTimelineForHonoApi(deps, 'localTimeline', note.id, 1000, r);
				if (note.fileIds.length > 0) {
					pushFanoutTimelineForHonoApi(deps, 'localTimelineWithFiles', note.id, 500, r);
				}
			}
		}
	}

	await r.exec();
}

export async function createNoteForHonoApi(
	deps: HonoApiNotesCreateDependencies,
	user: { id: MiUser['id']; username: string; host: MiUser['host']; isBot: boolean },
	data: CreateNoteData,
	silent = false,
	persist: (insert: (db: MiDrizzleDatabase) => Promise<MiNote>) => Promise<MiNote> = insert => insert(deps.db),
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
	const policies = await getHonoApiRolePolicies(deps, user as MiUser);

	if (data.visibility === 'public' && data.channel == null) {
		if (
			isKeyWordIncludedForHonoApi(data.cw ?? data.text ?? '', deps.meta.sensitiveWords) ||
			policies.canPublicNote === false
		) {
			data.visibility = 'home';
		}
	}

	if (isKeyWordIncludedForHonoApi(concatNoteContentsForKeyWordCheck(omitUndefined({ cw: data.cw, text: data.text, pollChoices: data.poll?.choices })), deps.meta.prohibitedWords)) {
		throw new IdentifiableError('689ee33f-f97c-479a-ac49-1b9f8140af99', 'Note contains prohibited words');
	}

	const inSilencedInstance = isSilencedHostForHonoApi(deps.meta.silencedHosts, user.host);
	if (data.visibility === 'public' && inSilencedInstance && user.host !== null) {
		data.visibility = 'home';
	}

	if (data.renote) {
		switch (data.renote.visibility) {
			case 'public':
				break;
			case 'home':
				if (data.visibility === 'public') data.visibility = 'home';
				break;
			case 'followers':
				if (data.renote.userId !== user.id) throw new Error('Renote target is not public or home');
				if (data.visibility === 'public' || data.visibility === 'home') data.visibility = 'followers';
				break;
			case 'specified':
				throw new Error('Renote target is not public or home');
		}
	}

	if (isRenoteData(data) && !isQuoteData(data)) {
		if (data.renote.userHost === null && data.renote.userId !== user.id) {
			const blocked = await blockingExistsInDatabase(deps.db, data.renote.userId, user.id);
			if (blocked) throw new Error('blocked');
		}
	}

	if (data.reply && data.reply.visibility !== 'public' && data.visibility === 'public') {
		data.visibility = 'home';
	}

	if (data.renote && data.renote.localOnly && data.channel == null) data.localOnly = true;
	if (data.reply && data.reply.localOnly && data.channel == null) data.localOnly = true;

	if (data.text) {
		if (data.text.length > DB_MAX_NOTE_TEXT_LENGTH) data.text = data.text.slice(0, DB_MAX_NOTE_TEXT_LENGTH);
		data.text = data.text.trim();
		if (data.text === '') data.text = null;
	} else {
		data.text = null;
	}

	let tags = data.apHashtags;
	let emojis = data.apEmojis;
	let mentionedUsers: MiUser[] | null | undefined = data.apMentions;

	if (!tags || !emojis || !mentionedUsers) {
		const tokens = data.text ? mfm.parse(data.text) : [];
		const cwTokens = data.cw ? mfm.parse(data.cw) : [];
		const choiceTokens = data.poll?.choices ? concat(data.poll.choices.map(c => mfm.parse(c))) : [];
		const combined = tokens.concat(cwTokens).concat(choiceTokens);

		tags = data.apHashtags ?? extractHashtags(combined);
		emojis = data.apEmojis ?? extractCustomEmojisFromMfm(combined);
		mentionedUsers = data.apMentions ?? await extractMentionedUsersForHonoApi(deps, user, combined);
	}

	if (isMediaSilencedHostForHonoApi(deps.meta.mediaSilencedHosts, user.host)) emojis = [];

	tags = tags.filter(tag => Array.from(tag).length <= 128).splice(0, 32);

	const resolvedApMentionUserIds = new Set((data.apMentions ?? []).map(user => user.id));
	const finalMentionedUsers: MiUser[] = mentionedUsers ?? [];
	const finalMentionedUserIds = new Set(finalMentionedUsers.map(user => user.id));
	let replyUserForVisibility: MiUser | null = null;

	if (data.reply && user.id !== data.reply.userId && !finalMentionedUserIds.has(data.reply.userId)) {
		replyUserForVisibility = await fetchUserByIdOrFailFromDatabase(deps.db, data.reply.userId);
		finalMentionedUsers.push(replyUserForVisibility);
		finalMentionedUserIds.add(replyUserForVisibility.id);
	}

	if (data.visibility === 'specified') {
		if (data.visibleUsers == null) throw new Error('invalid param');
		const visibleUserIds = new Set(data.visibleUsers.map(user => user.id));
		if (data.reply && !visibleUserIds.has(data.reply.userId)) {
			const replyUser = replyUserForVisibility ?? await fetchUserByIdOrFailFromDatabase(deps.db, data.reply.userId);
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
	const effectiveMentionCount = data.apMentionRawCount == null
		? countedMentionUserIds.size
		: data.apMentionRawCount + Array.from(countedMentionUserIds).filter(userId => !resolvedApMentionUserIds.has(userId)).length;
	if (effectiveMentionCount > 0 && effectiveMentionCount > policies.mentionLimit) {
		throw new IdentifiableError('9f466dab-c856-48cd-9e65-ff90ff750580', 'Note contains too many mentions');
	}

	const note = await persist(db => insertNoteForHonoApi(deps, user, data, tags, emojis, finalMentionedUsers, db));

	try {
		await postNoteCreatedForHonoApi(deps, note, user, data, tags!, finalMentionedUsers, silent);
	} catch (error) {
		// The note is already committed, so returning an error would invite clients to create a duplicate.
		console.error(`Failed to complete post-create processing for note ${note.id}`, error);
	}

	return note;
}

export async function fetchAndCreateNoteForHonoApi(
	deps: HonoApiNotesCreateDependencies,
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
	persist?: (insert: (db: MiDrizzleDatabase) => Promise<MiNote>) => Promise<MiNote>,
): Promise<MiNote> {
	const visibleUsers = data.visibleUserIds.length > 0
		? await listUsersByIdsFromDatabase(deps.db, data.visibleUserIds, { includeSuspended: true })
		: [];

	let files: MiDriveFile[] = [];
	if (data.fileIds.length > 0) {
		const found = await listDriveFilesByIdsFromDatabase(deps.db, data.fileIds);
		const map = new Map(found.filter(f => f.userId === user.id).map(f => [f.id, f]));
		files = data.fileIds.map(id => map.get(id)).filter((f): f is MiDriveFile => f != null);
		if (files.length !== data.fileIds.length) throw noSuchFileError();
	}

	let renote: MiNote | null = null;
	if (data.renoteId != null) {
		renote = await fetchNoteByIdFromDatabase(deps.db, data.renoteId);
		if (renote == null) throw noSuchRenoteTargetError();
		if (isRenote(renote) && !isQuote(renote)) throw cannotReRenoteError();

		if (renote.userId !== user.id) {
			const blocked = await blockingExistsInDatabase(deps.db, renote.userId, user.id);
			if (blocked) throw youHaveBeenBlockedError();
		}

		if (
			(renote.visibility === 'followers' && renote.userId !== user.id) ||
			renote.visibility === 'specified'
		) {
			throw cannotRenoteDueToVisibilityError();
		}

		if (renote.channelId && renote.channelId !== data.channelId) {
			const renoteChannel = await fetchChannelByIdFromDatabase(deps.db, renote.channelId);
			if (renoteChannel == null) throw noSuchChannelError();
			if (!renoteChannel.allowRenoteToExternal) throw cannotRenoteOutsideOfChannelError();
		}
	}

	let reply: MiNote | null = null;
	if (data.replyId != null) {
		reply = await fetchNoteByIdFromDatabase(deps.db, data.replyId);
		if (reply == null) throw noSuchReplyTargetError();
		if (isRenote(reply) && !isQuote(reply)) throw cannotReplyToPureRenoteError();
		if (!await isVisibleForMeForHonoApi(deps, reply, user.id)) throw cannotReplyToInvisibleNoteError();
		if (reply.visibility === 'specified' && data.visibility !== 'specified') throw cannotReplyToSpecifiedVisibilityNoteWithExtendedVisibilityError();

		if (reply.userId !== user.id) {
			const blocked = await blockingExistsInDatabase(deps.db, reply.userId, user.id);
			if (blocked) throw youHaveBeenBlockedError();
		}
	}

	if (data.poll && data.poll.expiresAt != null && data.poll.expiresAt.getTime() < Date.now()) {
		throw cannotCreateAlreadyExpiredPollError();
	}

	let channel: MiChannel | null = null;
	if (data.channelId != null) {
		channel = await fetchChannelByIdFromDatabase(deps.db, data.channelId);
		if (channel == null || channel.isArchived) throw noSuchChannelError();
	}

	return await createNoteForHonoApi(deps, user, omitUndefined({
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
	}), false, persist);
}

/**
 * 旧 ajv の `if`/`then` (renoteId/fileIds/mediaIds/poll が全部 null-or-absent の場合のみ text 必須+非空白必須)
 * を superRefine で再現する。
 */
export const notesCreateParamDef = z.object({
	visibility: z.enum(['public', 'home', 'followers', 'specified']).default('public'),
	visibleUserIds: uniqueItems(z.array(misskeyId())).optional(),
	cw: z.string().min(1).max(100).nullable().optional(),
	localOnly: z.boolean().default(false),
	reactionAcceptance: z.union([
		z.enum(['likeOnly', 'likeOnlyForRemote', 'nonSensitiveOnly', 'nonSensitiveOnlyForLocalLikeOnlyForRemote']),
		z.null(),
	]).default(null),
	noExtractMentions: z.boolean().default(false),
	noExtractHashtags: z.boolean().default(false),
	noExtractEmojis: z.boolean().default(false),
	replyId: misskeyId().nullable().optional(),
	renoteId: misskeyId().nullable().optional(),
	channelId: misskeyId().nullable().optional(),
	text: z.string().min(1).max(MAX_NOTE_TEXT_LENGTH).nullable().optional(),
	fileIds: uniqueItems(z.array(misskeyId()).min(1).max(16)).optional(),
	mediaIds: uniqueItems(z.array(misskeyId()).min(1).max(16)).optional(),
	poll: z.object({
		choices: uniqueItems(z.array(z.string().min(1).max(50)).min(2).max(10)),
		multiple: z.boolean().optional(),
		expiresAt: z.number().int().nullable().optional(),
		expiredAfter: z.number().int().min(1).nullable().optional(),
	}).nullable().optional(),
}).superRefine((data, ctx) => {
	const noAttachment = data.renoteId == null && data.fileIds == null && data.mediaIds == null && data.poll == null;
	if (noAttachment && (data.text == null || !/[^\s]+/.test(data.text))) {
		ctx.addIssue({ code: 'custom', path: ['text'], message: "must have required property 'text'" });
	}
});

export async function handleHonoApiNotesCreate(
	deps: HonoApiNotesCreateDependencies,
	me: { id: MiUser['id']; username: string; host: MiUser['host']; isBot: boolean },
	body: Record<string, unknown>,
): Promise<{ createdNote: unknown }> {
	const ps = parseHonoApiParams(notesCreateParamDef, body);

	try {
		const note = await fetchAndCreateNoteForHonoApi(deps, me, omitUndefined({
			createdAt: new Date(),
			fileIds: ps.fileIds ?? ps.mediaIds ?? [],
			poll: ps.poll ? {
				choices: ps.poll.choices,
				multiple: ps.poll.multiple ?? false,
				expiresAt: ps.poll.expiredAfter ? new Date(Date.now() + ps.poll.expiredAfter) : ps.poll.expiresAt ? new Date(ps.poll.expiresAt) : null,
			} : null,
			text: ps.text ?? null,
			replyId: ps.replyId ?? null,
			renoteId: ps.renoteId ?? null,
			cw: ps.cw ?? null,
			localOnly: ps.localOnly,
			reactionAcceptance: ps.reactionAcceptance,
			visibility: ps.visibility,
			visibleUserIds: ps.visibleUserIds ?? [],
			channelId: ps.channelId ?? null,
			apMentions: ps.noExtractMentions ? [] : undefined,
			apHashtags: ps.noExtractHashtags ? [] : undefined,
			apEmojis: ps.noExtractEmojis ? [] : undefined,
		}));

		return { createdNote: await packNoteForHonoApi(deps, note, me) };
	} catch (err) {
		if (err instanceof HonoApiError) throw err;
		if (err instanceof IdentifiableError) {
			if (err.id === '689ee33f-f97c-479a-ac49-1b9f8140af99') throw containsProhibitedWordsError();
			if (err.id === '9f466dab-c856-48cd-9e65-ff90ff750580') throw containsTooManyMentionsError();
		}
		throw err;
	}
}
