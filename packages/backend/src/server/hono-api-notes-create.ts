/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { domainToASCII } from 'node:url';
import * as mfm from 'mfm-js';
import type * as Redis from 'ioredis';
import { DB_MAX_NOTE_TEXT_LENGTH, MAX_NOTE_TEXT_LENGTH } from '@/const.js';
import { extractCustomEmojisFromMfm } from '@/misc/extract-custom-emojis-from-mfm.js';
import { extractHashtags } from '@/misc/extract-hashtags.js';
import { extractMentions } from '@/misc/extract-mentions.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { isQuote, isRenote } from '@/misc/is-renote.js';
import { isReply } from '@/misc/is-reply.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import { concat } from '@/misc/prelude/array.js';
import type { Config } from '@/config.js';
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
	listNotificationFollowerIdsByFolloweeIdFromDatabase,
} from '@/core/FollowingStore.js';
import { recordHashtagUsageInDatabase } from '@/core/HashtagStore.js';
import { adjustInstanceNotesCountFromDatabase, createInstanceInDatabase, fetchInstanceByHostFromDatabase } from '@/core/InstanceStore.js';
import {
	countNotesByUserIdAndChannelIdFromDatabase,
	createNoteInDatabase,
	createNoteWithPollInDatabase,
	fetchNoteByIdFromDatabase,
	incrementNoteRenoteCountInDatabase,
	incrementNoteRepliesCountInDatabase,
} from '@/core/NoteStore.js';
import { noteThreadMutingExistsInDatabase } from '@/core/NoteThreadMutingStore.js';
import { listUserListMembershipsForFanoutByUserIdFromDatabase, userListMembershipExistsInDatabase } from '@/core/UserListMembershipStore.js';
import { listUserProfilesByUserIdsFromDatabase, fetchUserProfileByUserIdFromDatabase } from '@/core/UserProfileStore.js';
import {
	fetchLocalUserByUsernameFromDatabase,
	fetchUserByIdOrFailFromDatabase,
	fetchUserByUsernameAndHostFromDatabase,
	incrementUserNotesCountAndUpdatedAtInDatabase,
	listUsersByIdsFromDatabase,
} from '@/core/UserStore.js';
import { mutingExistsInDatabase } from '@/core/MutingStore.js';
import { renoteMutingExistsInDatabase } from '@/core/RenoteMutingStore.js';
import { countMutualFollowingsBetweenUsersFromDatabase, followingExistsInDatabase } from '@/core/FollowingStore.js';
import type { EndedPollNotificationQueue, UserWebhookDeliverQueue } from '@/core/QueueModule.js';
import type { UserWebhookDeliverJobData } from '@/queue/types.js';
import { listWebhooksFromDatabase } from '@/core/WebhookStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { HonoApiError } from './hono-api-error.js';
import { deliverNoteActivityForHonoApi, renderNoteOrRenoteActivityForHonoApi, resolveRemoteRecipientForHonoApi, type HonoApiNoteApDependencies } from './hono-api-notes-ap.js';
import { packNoteForHonoApi, isVisibleForMeForHonoApi, type HonoApiNoteDependencies } from './hono-api-note.js';
import { getHonoApiRolePolicies, type HonoApiRolePolicyDependencies } from './hono-api-role-policy.js';
import { xaddHonoApiNotification, type HonoApiNotificationDependencies } from './hono-api-notification.js';
import type { HonoApiMainStreamPublisher, HonoApiNotesStreamPublisher } from './hono-api-events.js';
import type { HonoChartWriters } from './hono-chart-runtime.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiNotesCreateDependencies =
	& HonoApiNoteDependencies
	& HonoApiNoteApDependencies
	& HonoApiRolePolicyDependencies
	& HonoApiNotificationDependencies
	& {
		config: Config;
		meta: MiMeta;
		db: MiDrizzleDatabase;
		redisForTimelines: Redis.Redis;
		chartWriters: HonoChartWriters;
		userWebhookDeliverQueue: UserWebhookDeliverQueue;
		endedPollNotificationQueue: EndedPollNotificationQueue;
		publishNotesStream?: HonoApiNotesStreamPublisher;
		publishMainStream?: HonoApiMainStreamPublisher;
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
			return new RegExp(regexp[1], regexp[2]).test(text);
		} catch {
			return false;
		}
	});
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

async function resolveMentionedUserForHonoApi(deps: HonoApiNotesCreateDependencies, username: string, host: string | null): Promise<MiUser | null> {
	if (host == null) {
		return await fetchLocalUserByUsernameFromDatabase(deps.db, username.toLowerCase());
	}
	const puny = domainToASCII(host.toLowerCase());
	return await fetchUserByUsernameAndHostFromDatabase(deps.db, username.toLowerCase(), puny);
}

async function extractMentionedUsersForHonoApi(deps: HonoApiNotesCreateDependencies, user: { host: MiUser['host'] }, tokens: mfm.MfmNode[]): Promise<MiUser[]> {
	if (tokens == null) return [];
	const mentions = extractMentions(tokens);
	const resolved = (await Promise.all(mentions.map(m => resolveMentionedUserForHonoApi(deps, m.username, m.host ?? user.host).catch(() => null)))).filter((x): x is MiUser => x != null);
	return resolved.filter((u, i, self) => i === self.findIndex(u2 => u.id === u2.id));
}

function pushFanoutTimelineForHonoApi(deps: HonoApiNotesCreateDependencies, tl: string, id: string, maxlen: number, pipeline: Redis.ChainableCommander): void {
	const date = parseId(deps.config, id).date;
	if (date.getTime() > Date.now() - 1000 * 60 * 3) {
		pipeline.lpush('list:' + tl, id);
		if (Math.random() < 0.1) {
			pipeline.ltrim('list:' + tl, 0, maxlen - 1);
		}
	} else {
		deps.redisForTimelines.lindex('list:' + tl, -1).then(lastId => {
			if (lastId == null || date.getTime() > parseId(deps.config, lastId).date.getTime()) {
				deps.redisForTimelines.lpush('list:' + tl, id);
			}
		});
	}
}

export async function createNoteNotificationForHonoApi(
	deps: HonoApiNotificationDependencies,
	notifieeId: MiUser['id'],
	notifierId: MiUser['id'],
	type: 'mention' | 'reply' | 'renote' | 'quote' | 'note' | 'reaction',
	extra: Record<string, unknown>,
): Promise<void> {
	if (notifieeId === notifierId) return;

	const profile = await fetchUserProfileByUserIdFromDatabase(deps.db, notifieeId);
	const recieveConfig = (profile?.notificationRecieveConfig ?? {})[type as keyof NonNullable<typeof profile>['notificationRecieveConfig']];
	if (recieveConfig?.type === 'never') return;

	const muted = await mutingExistsInDatabase(deps.db, notifieeId, notifierId);
	if (muted) return;

	if (recieveConfig?.type === 'following') {
		if (!await followingExistsInDatabase(deps.db, notifieeId, notifierId)) return;
	} else if (recieveConfig?.type === 'follower') {
		if (!await followingExistsInDatabase(deps.db, notifierId, notifieeId)) return;
	} else if (recieveConfig?.type === 'mutualFollow') {
		const count = await countMutualFollowingsBetweenUsersFromDatabase(deps.db, notifieeId, notifierId);
		if (count !== 2) return;
	} else if (recieveConfig?.type === 'followingOrFollower') {
		const [isFollowing, isFollower] = await Promise.all([
			followingExistsInDatabase(deps.db, notifieeId, notifierId),
			followingExistsInDatabase(deps.db, notifierId, notifieeId),
		]);
		if (!isFollowing && !isFollower) return;
	} else if (recieveConfig?.type === 'list') {
		const isMember = await userListMembershipExistsInDatabase(deps.db, notifierId, recieveConfig.userListId);
		if (!isMember) return;
	}

	const notification = {
		id: genId(deps.config),
		createdAt: new Date().toISOString(),
		type,
		notifierId,
		...extra,
	};
	await xaddHonoApiNotification(deps, notifieeId, notification);
	deps.publishMainStream?.(notifieeId, 'notification', notification);
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

		for (const x of this.queue.values()) {
			const isVisibleToTarget = visibleUserIds === null || visibleUserIds.has(x.target);
			if (!isVisibleToTarget) continue;

			if (x.reason === 'renote') {
				void createNoteNotificationForHonoApi(deps, x.target, this.notifier.id, 'renote', { noteId: this.note.id, targetNoteId: this.note.renoteId! });
			} else {
				void createNoteNotificationForHonoApi(deps, x.target, this.notifier.id, x.reason, { noteId: this.note.id });
			}
		}
	}
}

export async function fetchOrRegisterInstanceForHonoApi(deps: { db: MiDrizzleDatabase; config: Pick<Config, 'id'> }, host: string): Promise<{ id: string; host: string }> {
	const puny = domainToASCII(host.toLowerCase());
	const existing = await fetchInstanceByHostFromDatabase(deps.db, puny);
	if (existing != null) return existing;

	try {
		return await createInstanceInDatabase(deps.db, {
			id: genId(deps.config),
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
	const webhooks = (await listWebhooksFromDatabase(deps.db, { isActive: true, on: [type] })).filter(w => w.userId === userId && w.on.includes(type));

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
			removeOnComplete: { age: 3600 * 24 * 7, count: 30 },
			removeOnFail: { age: 3600 * 24 * 7, count: 100 },
		});
	}));
}

type CreateNoteData = {
	createdAt: Date;
	name?: string | null;
	text: string | null;
	reply: MiNote | null;
	renote: MiNote | null;
	files: MiDriveFile[];
	poll: IPoll | null;
	localOnly: boolean;
	reactionAcceptance: MiNote['reactionAcceptance'];
	cw: string | null;
	visibility: string;
	visibleUsers: MiUser[] | null;
	channel: MiChannel | null;
	apMentions?: MiUser[] | null;
	apHashtags?: string[] | null;
	apEmojis?: string[] | null;
};

function isRenoteData(data: CreateNoteData): data is CreateNoteData & { renote: MiNote } {
	return data.renote != null;
}

function isQuoteData(data: CreateNoteData & { renote: MiNote }): boolean {
	return data.text != null || data.reply != null || data.cw != null || data.poll != null || (data.files != null && data.files.length > 0);
}

async function insertNoteForHonoApi(
	deps: HonoApiNotesCreateDependencies,
	user: { id: MiUser['id']; host: MiUser['host'] },
	data: CreateNoteData,
	tags: string[],
	emojis: string[],
	mentionedUsers: MiUser[],
): Promise<MiNote> {
	const insert: Record<string, unknown> = {
		id: genId(deps.config, data.createdAt.getTime()),
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
		const profiles = await listUserProfilesByUserIdsFromDatabase(deps.db, mentionedUsers.map(u => u.id));
		insert.mentionedRemoteUsers = JSON.stringify(mentionedUsers.filter((u): u is MiUser & { host: string } => u.host != null).map(u => {
			const profile = profiles.find(p => p.userId === u.id);
			return { uri: u.uri, url: profile?.url ?? undefined, username: u.username, host: u.host } as IMentionedRemoteUsers[0];
		}));
	}

	try {
		if (data.poll != null) {
			await createNoteWithPollInDatabase(deps.db, insert as Parameters<typeof createNoteInDatabase>[1], {
				noteId: insert.id as string,
				choices: data.poll.choices,
				expiresAt: data.poll.expiresAt,
				multiple: data.poll.multiple,
				votes: new Array(data.poll.choices.length).fill(0),
				noteVisibility: insert.visibility as MiNote['visibility'],
				userId: user.id,
				userHost: user.host,
				channelId: insert.channelId as string | null,
			});
		} else {
			await createNoteInDatabase(deps.db, insert as Parameters<typeof createNoteInDatabase>[1]);
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

async function postNoteCreatedForHonoApi(
	deps: HonoApiNotesCreateDependencies,
	note: MiNote,
	user: { id: MiUser['id']; host: MiUser['host']; isBot: boolean },
	data: CreateNoteData,
	tags: string[],
	mentionedUsers: MiUser[],
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
		for (const tag of tags) {
			await recordHashtagUsageInDatabase(deps.db, {
				id: genId(deps.config),
				name: normalizeForSearch(tag),
				userId: user.id,
				isLocalUser: user.host == null,
				isRemoteUser: user.host != null,
				isUserAttached: false,
				increment: true,
			});
		}
	}

	await incrementUserNotesCountAndUpdatedAtInDatabase(deps.db, user.id, new Date());

	if (deps.meta.enableFanoutTimeline) {
		void pushNoteToFanoutTimelinesForHonoApi(deps, note, user);
	}

	if (data.reply) {
		await incrementNoteRepliesCountInDatabase(deps.db, data.reply.id, 1);
	}

	if (data.reply == null) {
		listNotificationFollowerIdsByFolloweeIdFromDatabase(deps.db, user.id).then(async followerIds => {
			if (note.visibility !== 'specified') {
				const isPureRenote = isRenoteData(data) && !isQuoteData(data);
				for (const followerId of followerIds) {
					if (isPureRenote) {
						const renoteMuted = await renoteMutingExistsInDatabase(deps.db, followerId, user.id);
						if (renoteMuted) continue;
					}
					void createNoteNotificationForHonoApi(deps, followerId, user.id, 'note', { noteId: note.id });
				}
			}
		}).catch(() => {});
	}

	if (data.renote && data.renote.userId !== user.id && !user.isBot) {
		void incrementNoteRenoteCountInDatabase(deps.db, data.renote.id, 1);
	}

	if (data.poll && data.poll.expiresAt) {
		const delay = data.poll.expiresAt.getTime() - Date.now();
		await deps.endedPollNotificationQueue.add(note.id, { noteId: note.id }, {
			delay,
			removeOnComplete: { age: 3600 * 24 * 7, count: 30 },
			removeOnFail: { age: 3600 * 24 * 7, count: 100 },
		});
	}

	if (user.host == null) {
		void deps.chartWriters.activeUsersChart.write(user as { id: string; host: null });
	}

	const noteObj = await packNoteForHonoApi(deps, note, null, { skipHide: true, withReactionAndUserPairCache: true });

	deps.publishNotesStream?.(noteObj);

	void enqueueUserWebhookForHonoApi(deps, user.id, 'note', noteObj);

	const nm = new HonoNotificationManager(user, note);

	for (const u of mentionedUsers.filter(u => u.host == null)) {
		const isThreadMuted = await noteThreadMutingExistsInDatabase(deps.db, u.id, note.threadId ?? note.id);
		if (isThreadMuted) continue;

		const detailPackedNote = await packNoteForHonoApi(deps, note, u, { detail: true });
		deps.publishMainStream?.(u.id, 'mention', detailPackedNote);
		void enqueueUserWebhookForHonoApi(deps, u.id, 'mention', detailPackedNote);
		nm.push(u.id, 'mention');
	}

	if (data.reply) {
		if (data.reply.userHost === null) {
			const isThreadMuted = await noteThreadMutingExistsInDatabase(deps.db, data.reply.userId, data.reply.threadId ?? data.reply.id);
			if (!isThreadMuted) {
				nm.push(data.reply.userId, 'reply');
				deps.publishMainStream?.(data.reply.userId, 'reply', noteObj);
				void enqueueUserWebhookForHonoApi(deps, data.reply.userId, 'reply', noteObj);
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
			void enqueueUserWebhookForHonoApi(deps, data.renote.userId, 'renote', noteObj);
		}
	}

	await nm.notify(deps);

	if (!data.localOnly && user.host == null) {
		(async () => {
			const activity = await renderNoteOrRenoteActivityForHonoApi(deps, {
				localOnly: data.localOnly,
				renote: data.renote,
				isQuote: isRenoteData(data) && isQuoteData(data),
			}, note);

			const directRecipients = (await Promise.all(mentionedUsers.filter(u => u.host != null).map(u => resolveRemoteRecipientForHonoApi(deps, u.id)))).filter((u): u is NonNullable<typeof u> => u != null);

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
		})().catch(() => {});
	}

	if (data.channel) {
		await incrementChannelNotesCountAndUpdateLastNotedAtInDatabase(deps.db, data.channel.id, new Date());
		countNotesByUserIdAndChannelIdFromDatabase(deps.db, user.id, data.channel.id).then(count => {
			if (count === 1) void incrementChannelUsersCountInDatabase(deps.db, data.channel!.id);
		}).catch(() => {});
	}
}

async function pushNoteToFanoutTimelinesForHonoApi(deps: HonoApiNotesCreateDependencies, note: MiNote, user: { id: MiUser['id']; host: MiUser['host'] }): Promise<void> {
	const r = deps.redisForTimelines.pipeline();

	if (note.channelId) {
		pushFanoutTimelineForHonoApi(deps, `channelTimeline:${note.channelId}`, note.id, deps.config.perChannelMaxNoteCacheCount, r);
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

		if (note.visibility === 'followers') {
			userListMemberships = userListMemberships.filter(x => x.userListUserId === user.id || followings.some(f => f.followerId === x.userListUserId));
		}

		for (const following of followings) {
			if (note.visibility === 'specified' && !note.visibleUserIds.some(v => v === following.followerId)) continue;
			if (isReply(note, following.followerId) && !following.withReplies) continue;

			pushFanoutTimelineForHonoApi(deps, `homeTimeline:${following.followerId}`, note.id, deps.meta.perUserHomeTimelineCacheMax, r);
			if (note.fileIds.length > 0) {
				pushFanoutTimelineForHonoApi(deps, `homeTimelineWithFiles:${following.followerId}`, note.id, deps.meta.perUserHomeTimelineCacheMax / 2, r);
			}
		}

		for (const membership of userListMemberships) {
			if (note.visibility === 'specified' && note.userId !== membership.userListUserId && !note.visibleUserIds.some(v => v === membership.userListUserId)) continue;
			if (isReply(note, membership.userListUserId) && !membership.withReplies) continue;

			pushFanoutTimelineForHonoApi(deps, `userListTimeline:${membership.userListId}`, note.id, deps.meta.perUserListTimelineCacheMax, r);
			if (note.fileIds.length > 0) {
				pushFanoutTimelineForHonoApi(deps, `userListTimelineWithFiles:${membership.userListId}`, note.id, deps.meta.perUserListTimelineCacheMax / 2, r);
			}
		}

		if (note.userHost == null) {
			if (note.visibility !== 'specified' || !note.visibleUserIds.some(v => v === user.id)) {
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

async function createNoteForHonoApi(
	deps: HonoApiNotesCreateDependencies,
	user: { id: MiUser['id']; host: MiUser['host']; isBot: boolean },
	data: CreateNoteData,
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

	if (data.visibility === 'public' && data.channel == null) {
		if (isKeyWordIncludedForHonoApi(data.cw ?? data.text ?? '', deps.meta.sensitiveWords)) {
			data.visibility = 'home';
		} else if ((await getHonoApiRolePolicies(deps, user as MiUser)).canPublicNote === false) {
			data.visibility = 'home';
		}
	}

	if (isKeyWordIncludedForHonoApi(concatNoteContentsForKeyWordCheck({ cw: data.cw, text: data.text, pollChoices: data.poll?.choices }), deps.meta.prohibitedWords)) {
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

	const finalMentionedUsers: MiUser[] = mentionedUsers ?? [];

	if (data.reply && user.id !== data.reply.userId && !finalMentionedUsers.some(u => u.id === data.reply!.userId)) {
		finalMentionedUsers.push(await fetchUserByIdOrFailFromDatabase(deps.db, data.reply.userId));
	}

	if (data.visibility === 'specified') {
		if (data.visibleUsers == null) throw new Error('invalid param');
		for (const u of data.visibleUsers) {
			if (!finalMentionedUsers.some(x => x.id === u.id)) finalMentionedUsers.push(u);
		}
		if (data.reply && !data.visibleUsers.some(x => x.id === data.reply!.userId)) {
			data.visibleUsers.push(await fetchUserByIdOrFailFromDatabase(deps.db, data.reply.userId));
		}
	}

	const policies = await getHonoApiRolePolicies(deps, user as MiUser);
	if (finalMentionedUsers.length > 0 && finalMentionedUsers.length > policies.mentionLimit) {
		throw new IdentifiableError('9f466dab-c856-48cd-9e65-ff90ff750580', 'Note contains too many mentions');
	}

	const note = await insertNoteForHonoApi(deps, user, data, tags, emojis, finalMentionedUsers);

	setImmediate(() => {
		postNoteCreatedForHonoApi(deps, note, user, data, tags!, finalMentionedUsers).catch(() => {});
	});

	return note;
}

async function fetchAndCreateNoteForHonoApi(
	deps: HonoApiNotesCreateDependencies,
	user: { id: MiUser['id']; host: MiUser['host']; isBot: boolean },
	data: {
		createdAt: Date;
		replyId: string | null;
		renoteId: string | null;
		fileIds: string[];
		text: string | null;
		cw: string | null;
		visibility: string;
		visibleUserIds: string[];
		channelId: string | null;
		localOnly: boolean;
		reactionAcceptance: MiNote['reactionAcceptance'];
		poll: IPoll | null;
		apMentions?: MiUser[] | null;
		apHashtags?: string[] | null;
		apEmojis?: string[] | null;
	},
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

		if (renote.visibility === 'followers' && renote.userId !== user.id) {
			throw cannotRenoteDueToVisibilityError();
		} else if (renote.visibility === 'specified') {
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

	return await createNoteForHonoApi(deps, user, {
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
	});
}

const notesCreateParamDef = {
	type: 'object',
	properties: {
		visibility: { type: 'string', enum: ['public', 'home', 'followers', 'specified'], default: 'public' },
		visibleUserIds: { type: 'array', uniqueItems: true, items: { type: 'string', format: 'misskey:id' } },
		cw: { type: 'string', nullable: true, minLength: 1, maxLength: 100 },
		localOnly: { type: 'boolean', default: false },
		reactionAcceptance: { type: 'string', nullable: true, enum: [null, 'likeOnly', 'likeOnlyForRemote', 'nonSensitiveOnly', 'nonSensitiveOnlyForLocalLikeOnlyForRemote'], default: null },
		noExtractMentions: { type: 'boolean', default: false },
		noExtractHashtags: { type: 'boolean', default: false },
		noExtractEmojis: { type: 'boolean', default: false },
		replyId: { type: 'string', format: 'misskey:id', nullable: true },
		renoteId: { type: 'string', format: 'misskey:id', nullable: true },
		channelId: { type: 'string', format: 'misskey:id', nullable: true },
		text: { type: 'string', minLength: 1, maxLength: MAX_NOTE_TEXT_LENGTH, nullable: true },
		fileIds: { type: 'array', uniqueItems: true, minItems: 1, maxItems: 16, items: { type: 'string', format: 'misskey:id' } },
		mediaIds: { type: 'array', uniqueItems: true, minItems: 1, maxItems: 16, items: { type: 'string', format: 'misskey:id' } },
		poll: {
			type: 'object',
			nullable: true,
			properties: {
				choices: { type: 'array', uniqueItems: true, minItems: 2, maxItems: 10, items: { type: 'string', minLength: 1, maxLength: 50 } },
				multiple: { type: 'boolean' },
				expiresAt: { type: 'integer', nullable: true },
				expiredAfter: { type: 'integer', nullable: true, minimum: 1 },
			},
			required: ['choices'],
		},
	},
	if: {
		properties: {
			renoteId: { type: 'null' },
			fileIds: { type: 'null' },
			mediaIds: { type: 'null' },
			poll: { type: 'null' },
		},
	},
	then: {
		properties: {
			text: { type: 'string', minLength: 1, maxLength: MAX_NOTE_TEXT_LENGTH, pattern: '[^\\s]+' },
		},
		required: ['text'],
	},
} as const;

type NotesCreateParams = {
	visibility: 'public' | 'home' | 'followers' | 'specified';
	visibleUserIds?: string[];
	cw?: string | null;
	localOnly: boolean;
	reactionAcceptance: MiNote['reactionAcceptance'];
	noExtractMentions: boolean;
	noExtractHashtags: boolean;
	noExtractEmojis: boolean;
	replyId?: string | null;
	renoteId?: string | null;
	channelId?: string | null;
	text?: string | null;
	fileIds?: string[];
	mediaIds?: string[];
	poll?: { choices: string[]; multiple?: boolean; expiresAt?: number | null; expiredAfter?: number | null } | null;
};

export async function handleHonoApiNotesCreate(
	deps: HonoApiNotesCreateDependencies,
	me: { id: MiUser['id']; host: MiUser['host']; isBot: boolean },
	body: Record<string, unknown>,
): Promise<{ createdNote: unknown }> {
	const ps = parseHonoApiParams(notesCreateParamDef, body) as NotesCreateParams;

	try {
		const note = await fetchAndCreateNoteForHonoApi(deps, me, {
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
		});

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
