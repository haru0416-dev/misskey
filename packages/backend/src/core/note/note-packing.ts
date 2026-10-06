/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { toPuny, toPunyNullable } from '@/misc/to-puny.js';
import type * as Redis from 'ioredis';
import { fetchChannelByIdFromDatabase, listChannelsByIdsFromDatabase } from '@/core/channel/channel-store.js';
import { fetchEmojisByNamesAndHostsFromDatabaseCached } from '@/core/emoji/emoji-store.js';
import {
	followingExistsInDatabase,
	listFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabase,
	listFollowingsByFollowerIdsAndFolloweeIdsFromDatabase,
} from '@/core/user/following-store.js';
import { fetchNoteByIdOrFailFromDatabase } from '@/core/note/note-store.js';
import {
	fetchNoteReactionByUserAndNoteFromDatabase,
	listNoteReactionsByNoteIdsAndUserIdsFromDatabase,
} from '@/core/note/note-reaction-store.js';
import { fetchPollByNoteIdOrFailFromDatabase, listPollsByNoteIdsFromDatabase } from '@/core/note/poll-store.js';
import {
	fetchPollVoteByNoteAndUserFromDatabase,
	listPollVotesByNoteAndUserFromDatabase,
	listPollVotesByNoteIdsAndUserIdsFromDatabase,
} from '@/core/note/poll-vote-store.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/user/user-store.js';
import type { Config } from '@/config.js';
import { isEntityNotFoundError } from '@/misc/db-errors.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { shouldHideNoteByTime } from '@/misc/should-hide-note-by-time.js';
import { isQuotePacked, isRenotePacked } from '@/misc/is-renote.js';
import { deepClone, omitUndefined } from '@/misc/clone.js';
import type { MiNote } from '@/models/Note.js';
import type { MiPoll } from '@/models/Poll.js';
import type { MiPollVote } from '@/models/PollVote.js';
import type { MiUser } from '@/models/User.js';
import { packDriveFileManyByIds } from '../drive/drive-file-packing.js';
import type { DriveFileDependencies } from '../drive/drive-file-packing.js';
import { packUserLite, packUserLiteMany } from '../user/user-packing.js';
import type { UserPackingDependencies } from '../user/user-packing.js';

export type NoteDependencies = DriveFileDependencies &
	UserPackingDependencies & {
		redis: Redis.Redis;
		/** fanout タイムライン (Redis) 読み取りに必要。省略時は常にDBから読む。 */
		redisForTimelines?: Redis.Redis;
	};

export type EmojiPopulateDependencies = {
	config: Config;
	db: NoteDependencies['db'];
};

const decodeCustomEmojiRegexp = /^:([\w+-]+)(?:@([\w.-]+))?:$/;

function decodeReaction(str: string): { reaction: string; name?: string; host?: string | null } {
	const custom = str.match(decodeCustomEmojiRegexp);

	if (custom) {
		const name = custom[1];
		if (name == null) {
			return { reaction: str };
		}
		const host = custom[2] ?? null;

		return {
			reaction: `:${name}@${host ?? '.'}:`,
			name,
			host,
		};
	}

	return { reaction: str };
}

export function normalizeReactionKey(reaction: string): string {
	return decodeReaction(reaction).reaction;
}

export function normalizeReactionKeys(reactions: MiNote['reactions']): MiNote['reactions'] {
	const normalized: MiNote['reactions'] = {};
	for (const [reaction, count] of Object.entries(reactions)) {
		if (!(count > 0)) continue;
		const key = normalizeReactionKey(reaction);
		normalized[key] = (normalized[key] ?? 0) + count;
	}
	return normalized;
}

function collectReactionEmojiNames(reactions: MiNote['reactions']): string[] {
	const names: string[] = [];
	for (const reaction of Object.keys(reactions)) {
		if (reaction.startsWith(':') && reaction.includes('@') && !reaction.includes('@.')) {
			names.push(decodeReaction(reaction).reaction.replaceAll(':', ''));
		}
	}
	return names;
}

function isSelfHost(config: Config, host: string | null): boolean {
	if (host == null) {
		return true;
	}
	return toPuny(config.runtime.host) === toPuny(host);
}

const parseEmojiStrRegexp = /^([-\w]+)(?:@([\w.-]+))?$/;

function normalizeEmojiHost(config: Config, src: string | undefined, noteUserHost: string | null): string | null {
	const host =
		src === '.' ? null : src === undefined ? noteUserHost : isSelfHost(config, src) ? null : src || noteUserHost;
	return toPunyNullable(host);
}

function parseEmojiStr(
	config: Config,
	emojiName: string,
	noteUserHost: string | null,
): { name: string | null; host: string | null } {
	const match = emojiName.match(parseEmojiStrRegexp);
	if (!match) {
		return { name: null, host: null };
	}

	const name = match[1]!;
	const host = normalizeEmojiHost(config, match[2], noteUserHost);

	return { name, host };
}

export async function populateEmojis(
	deps: EmojiPopulateDependencies,
	emojiNames: string[],
	noteUserHost: string | null,
): Promise<Record<string, string>> {
	return (await populateEmojisMany(deps, [{ emojiNames, noteUserHost }]))[0]!;
}

export async function populateEmojisMany(
	deps: EmojiPopulateDependencies,
	requests: readonly { emojiNames: readonly string[]; noteUserHost: string | null }[],
): Promise<Record<string, string>[]> {
	const refs: { requestIndex: number; emojiName: string; name: string; host: string }[] = [];
	for (let requestIndex = 0; requestIndex < requests.length; requestIndex++) {
		const request = requests[requestIndex]!;
		for (const emojiName of new Set(request.emojiNames)) {
			const { name, host } = parseEmojiStr(deps.config, emojiName, request.noteUserHost);
			if (name == null || host == null) {
				continue;
			}
			refs.push({ requestIndex, emojiName, name, host });
		}
	}

	const emojis = await fetchEmojisByNamesAndHostsFromDatabaseCached(
		deps.db,
		refs.map((ref) => ({ name: ref.name, host: ref.host })),
	);
	const results = requests.map(() => ({}) as Record<string, string>);
	for (let i = 0; i < refs.length; i++) {
		const emoji = emojis[i];
		if (emoji == null) {
			continue;
		}
		results[refs[i]!.requestIndex]![refs[i]!.emojiName] = emoji.publicUrl || emoji.originalUrl;
	}

	return results;
}

async function nullIfEntityNotFound<T>(promise: Promise<T>): Promise<T | null> {
	try {
		return await promise;
	} catch (err) {
		if (isEntityNotFoundError(err)) {
			return null;
		}
		throw err;
	}
}

async function populatePoll(
	deps: NoteDependencies,
	note: MiNote,
	meId: MiUser['id'] | null,
	hint?: {
		poll: MiPoll;
		votes?: MiPollVote[];
	},
): Promise<{
	multiple: boolean;
	expiresAt: string | null;
	choices: { text: string; votes: number; isVoted: boolean }[];
}> {
	const poll = hint?.poll ?? (await fetchPollByNoteIdOrFailFromDatabase(deps.db, note.id));
	// 選択肢テキストが重複していても正しい票数を引けるよう、indexOf ではなく列挙位置を使う。
	const choices = poll.choices.map((c, index) => ({
		text: c,
		votes: poll.votes[index]!,
		isVoted: false,
	}));

	if (meId) {
		const votes =
			hint?.votes ??
			(poll.multiple
				? await listPollVotesByNoteAndUserFromDatabase(deps.db, note.id, meId)
				: [await fetchPollVoteByNoteAndUserFromDatabase(deps.db, note.id, meId)].filter(
						(vote): vote is MiPollVote => vote != null,
					));
		for (const vote of votes) {
			choices[vote.choice]!.isVoted = true;
		}
	}

	return {
		multiple: poll.multiple,
		expiresAt: poll.expiresAt?.toISOString() ?? null,
		choices,
	};
}

export async function populateMyReaction(
	deps: NoteDependencies,
	note: {
		id: MiNote['id'];
		reactions: MiNote['reactions'];
		reactionAndUserPairCache: MiNote['reactionAndUserPairCache'];
	},
	meId: MiUser['id'],
): Promise<string | undefined> {
	const reactionsCount = Object.values(note.reactions).reduce((a, b) => a + b, 0);
	if (reactionsCount === 0) {
		return undefined;
	}

	if (note.reactionAndUserPairCache && reactionsCount <= note.reactionAndUserPairCache.length) {
		const pair = note.reactionAndUserPairCache.find((p) => p.startsWith(meId));
		if (pair) {
			return normalizeReactionKey(pair.split('/')[1]!);
		}
		return undefined;
	}

	if (parseId(note.id).date.getTime() + 2000 > Date.now()) {
		return undefined;
	}

	const reaction = await fetchNoteReactionByUserAndNoteFromDatabase(deps.db, meId, note.id);
	if (reaction) {
		return normalizeReactionKey(reaction.reaction);
	}

	return undefined;
}

function treatVisibility(packedNote: Packed<'Note'>): Packed<'Note'>['visibility'] {
	if (packedNote.visibility === 'public' || packedNote.visibility === 'home') {
		const followersOnlyBefore = (packedNote.user as { makeNotesFollowersOnlyBefore?: number | null })
			.makeNotesFollowersOnlyBefore;
		if (shouldHideNoteByTime(followersOnlyBefore, packedNote.createdAt)) {
			packedNote.visibility = 'followers';
		}
	}
	return packedNote.visibility;
}

async function shouldHideNote(
	deps: NoteDependencies,
	packedNote: Packed<'Note'>,
	meId: MiUser['id'] | null,
	followeeIds?: Set<MiUser['id']>,
	followeeIdCoverage?: Set<MiUser['id']>,
): Promise<boolean> {
	if (meId === packedNote.userId) {
		return false;
	}

	const user = packedNote.user as { requireSigninToViewContents?: boolean; makeNotesHiddenBefore?: number | null };
	if (user.requireSigninToViewContents && meId == null) {
		return true;
	}

	if (shouldHideNoteByTime(user.makeNotesHiddenBefore, packedNote.createdAt)) {
		return true;
	}

	if (packedNote.visibility === 'specified') {
		if (meId == null) {
			return true;
		}
		const specified = packedNote.visibleUserIds?.includes(meId);
		if (!specified) {
			return true;
		}
	}

	if (packedNote.visibility === 'followers') {
		if (meId == null) {
			return true;
		}
		if (packedNote.reply && meId === packedNote.reply.userId) {
			return false;
		}
		if (packedNote.mentions?.includes(meId)) {
			return false;
		}

		// followeeIds が全フォロー先、または coverage に含まれる対象者の照会結果なら再利用する。
		const canUseHint = followeeIds != null && (followeeIdCoverage == null || followeeIdCoverage.has(packedNote.userId));
		const isFollowing = canUseHint
			? followeeIds.has(packedNote.userId)
			: await followingExistsInDatabase(deps.db, meId, packedNote.userId);
		if (!isFollowing) {
			return true;
		}
	}

	return false;
}

function hideNote(packedNote: Packed<'Note'>): void {
	packedNote.visibleUserIds = undefined;
	packedNote.fileIds = [];
	packedNote.files = [];
	packedNote.text = null;
	packedNote.poll = undefined;
	packedNote.cw = null;
	packedNote.isHidden = true;
}

function collectEmbeddedNotes(note: Packed<'Note'>): Packed<'Note'>[] {
	const notes = [note];
	for (const current of notes) {
		if (current.reply) notes.push(current.reply);
		if (current.renote) notes.push(current.renote);
	}
	return notes;
}

function shouldDropRenoteChain(note: Packed<'Note'>, hiddenNotes: Set<Packed<'Note'>>): boolean {
	let hasHiddenNote = false;
	let hasPureRenote = false;
	for (let current: Packed<'Note'> | null | undefined = note; current != null; current = current.renote) {
		hasHiddenNote ||= hiddenNotes.has(current);
		hasPureRenote ||= isRenotePacked(current) && !isQuotePacked(current);
	}
	return hasHiddenNote && hasPureRenote;
}

function hideEmbeddedNotes(
	note: Packed<'Note'>,
	clonedNote: Packed<'Note'>,
	hiddenNotes: Set<Packed<'Note'>>,
): Packed<'Note'> {
	let currentCloned = clonedNote;
	for (let current: Packed<'Note'> | null | undefined = note; current != null; current = current.renote) {
		if (hiddenNotes.has(current)) hideNote(currentCloned);
		if (current.reply && currentCloned.reply) {
			currentCloned.reply = shouldDropRenoteChain(current.reply, hiddenNotes)
				? null
				: hideEmbeddedNotes(current.reply, currentCloned.reply, hiddenNotes);
		}
		currentCloned = currentCloned.renote!;
	}
	return clonedNote;
}

export async function filterNoteForStreamingHiding(
	deps: NoteDependencies,
	note: Packed<'Note'>,
	meId: MiUser['id'] | null,
): Promise<Packed<'Note'> | null> {
	const notes = collectEmbeddedNotes(note);
	const shouldHide = await Promise.all(notes.map((n) => shouldHideNote(deps, n, meId)));
	if (!shouldHide.some(Boolean)) return note;

	const hiddenNotes = new Set(notes.filter((_, i) => shouldHide[i]));
	if (shouldDropRenoteChain(note, hiddenNotes)) return null;

	// Pub/Sub の投稿は接続間で共有するため、閲覧者ごとのマスクは複製にだけ適用する。
	return hideEmbeddedNotes(note, deepClone(note), hiddenNotes);
}

export async function isVisibleForMe(
	deps: NoteDependencies,
	note: MiNote,
	meId: MiUser['id'] | null,
	hint?: {
		followeeIds: Set<MiUser['id']>;
		followeeIdCoverage: Set<MiUser['id']>;
		meHost: MiUser['host'];
	},
): Promise<boolean> {
	if (note.visibility === 'specified') {
		if (meId == null) {
			return false;
		}
		if (meId === note.userId) {
			return true;
		}
		return note.visibleUserIds.includes(meId);
	}

	if (note.visibility === 'followers') {
		if (meId == null) {
			return false;
		}
		if (meId === note.userId) {
			return true;
		}
		// 自分の投稿への返信。note.reply は呼び出し元が関連を読み込まないと入らないので、列の値を見る。
		if (note.replyUserId != null && meId === note.replyUserId) {
			return true;
		}
		if (note.mentions?.includes(meId)) {
			return true;
		}

		const [isFollowing, meHost] = await Promise.all([
			hint?.followeeIdCoverage.has(note.userId)
				? hint.followeeIds.has(note.userId)
				: followingExistsInDatabase(deps.db, meId, note.userId),
			hint != null ? hint.meHost : fetchUserByIdOrFailFromDatabase(deps.db, meId).then((user) => user.host),
		]);
		return isFollowing || (note.userHost != null && meHost != null);
	}

	return true;
}

export async function filterVisibleNotes(
	deps: NoteDependencies,
	notes: MiNote[],
	meId: MiUser['id'] | null,
): Promise<MiNote[]> {
	const followeeIdCoverage = new Set(
		notes
			.filter(
				(note) =>
					note.visibility === 'followers' &&
					meId != null &&
					note.userId !== meId &&
					note.replyUserId !== meId &&
					!note.mentions?.includes(meId),
			)
			.map((note) => note.userId),
	);

	if (meId == null || followeeIdCoverage.size === 0) {
		const visibility = await Promise.all(notes.map((note) => isVisibleForMe(deps, note, meId)));
		return notes.filter((_, index) => visibility[index]);
	}

	const needsMeHost = notes.some((note) => followeeIdCoverage.has(note.userId) && note.userHost != null);
	const [followeeIds, meHost] = await Promise.all([
		listFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabase(deps.db, meId, [...followeeIdCoverage]),
		needsMeHost ? fetchUserByIdOrFailFromDatabase(deps.db, meId).then((user) => user.host) : Promise.resolve(null),
	]);
	const hint = {
		followeeIds: new Set(followeeIds),
		followeeIdCoverage,
		meHost,
	};
	const visibility = await Promise.all(notes.map((note) => isVisibleForMe(deps, note, meId, hint)));
	return notes.filter((_, index) => visibility[index]);
}

type PackNoteChannel = NonNullable<Awaited<ReturnType<typeof fetchChannelByIdFromDatabase>>>;

/**
 * packNoteMany が事前一括取得した結果。`noteIds` に含まれるノートについてのみ
 * 各 Map の内容を信頼してよい。含まれないノートは個別取得にフォールバックする。
 */
export type PackNoteBatchHint = {
	noteIds: Set<MiNote['id']>;
	myReactions: Map<MiNote['id'], string | undefined>;
	polls: Map<MiNote['id'], MiPoll>;
	pollVotes: Map<MiNote['id'], MiPollVote[]>;
	pollVoteNoteIds: Set<MiNote['id']>;
	reactionEmojis: Map<MiNote['id'], Record<string, string>>;
	emojis: Map<MiNote['id'], Record<string, string> | undefined>;
	packedUsers: Map<MiUser['id'], Packed<'UserLite'>>;
	packedFiles: Map<string, Packed<'DriveFile'>>;
	channels: Map<string, PackNoteChannel>;
	/**
	 * me のフォロー先ID集合。followeeIdCoverage が無ければ全フォロー先、あれば coverage 内の
	 * ユーザーだけを照会した結果。
	 */
	followeeIds?: Set<MiUser['id']>;
	followeeIdCoverage?: Set<MiUser['id']>;
};

export async function packNote(
	deps: NoteDependencies,
	src: MiNote['id'] | MiNote,
	me: { id: MiUser['id'] } | null | undefined,
	options?: {
		detail?: boolean;
		skipHide?: boolean;
		withReactionAndUserPairCache?: boolean;
		hint?: PackNoteBatchHint;
	},
): Promise<Packed<'Note'>> {
	const opts = {
		detail: true,
		skipHide: false,
		withReactionAndUserPairCache: false,
		...options,
	};

	const meId = me ? me.id : null;
	const note = typeof src === 'object' ? src : await fetchNoteByIdOrFailFromDatabase(deps.db, src);
	const host = note.userHost;

	// hint は事前一括取得の対象だったノートに限り信頼する。
	const hint = opts.hint?.noteIds.has(note.id) ? opts.hint : undefined;

	const reactions = normalizeReactionKeys(note.reactions);
	const reactionAndUserPairCache = note.reactionAndUserPairCache;

	let text = note.text;
	if (note.name && (note.url ?? note.uri)) {
		text = `【${note.name}】\n${(note.text ?? '').trim()}\n\n${note.url ?? note.uri}`;
	}

	const reactionEmojiNames = collectReactionEmojiNames(reactions);

	const [user, files, reactionEmojis, emojis, channel, reply, renote, poll, myReaction] = await Promise.all([
		hint?.packedUsers.get(note.userId) ?? packUserLite(deps, note.user ?? note.userId),
		hint != null
			? note.fileIds.map((id) => hint.packedFiles.get(id)).filter((f): f is Packed<'DriveFile'> => f != null)
			: packDriveFileManyByIds(deps, note.fileIds),
		hint?.reactionEmojis.get(note.id) ?? populateEmojis(deps, reactionEmojiNames, host),
		hint?.emojis.has(note.id)
			? hint.emojis.get(note.id)
			: host != null
				? populateEmojis(deps, note.emojis, host)
				: Promise.resolve(undefined),
		note.channelId
			? hint != null
				? (hint.channels.get(note.channelId) ?? null)
				: fetchChannelByIdFromDatabase(deps.db, note.channelId)
			: Promise.resolve(null),
		opts.detail && note.replyId
			? nullIfEntityNotFound(
					packNote(
						deps,
						note.reply ?? note.replyId,
						me,
						omitUndefined({
							detail: false,
							skipHide: opts.skipHide,
							withReactionAndUserPairCache: opts.withReactionAndUserPairCache,
							hint: opts.hint,
						}),
					),
				)
			: Promise.resolve(undefined),
		opts.detail && note.renoteId
			? nullIfEntityNotFound(
					packNote(
						deps,
						note.renote ?? note.renoteId,
						me,
						omitUndefined({
							detail: true,
							skipHide: opts.skipHide,
							withReactionAndUserPairCache: opts.withReactionAndUserPairCache,
							hint: opts.hint,
						}),
					),
				)
			: Promise.resolve(undefined),
		opts.detail && note.hasPoll
			? populatePoll(
					deps,
					note,
					meId,
					hint?.polls.has(note.id)
						? {
								poll: hint.polls.get(note.id)!,
								...(hint.pollVoteNoteIds.has(note.id) ? { votes: hint.pollVotes.get(note.id) ?? [] } : {}),
							}
						: undefined,
				)
			: Promise.resolve(undefined),
		opts.detail && meId && Object.keys(reactions).length > 0
			? hint?.myReactions.has(note.id)
				? hint.myReactions.get(note.id)
				: populateMyReaction(
						deps,
						{
							id: note.id,
							reactions,
							reactionAndUserPairCache,
						},
						meId,
					)
			: Promise.resolve(undefined),
	]);

	const packed = {
		id: note.id,
		createdAt: parseId(note.id).date.toISOString(),
		updatedAt: note.updatedAt == null ? undefined : new Date(note.updatedAt).toISOString(),
		userId: note.userId,
		user,
		text,
		cw: note.cw,
		visibility: note.visibility,
		localOnly: note.localOnly,
		reactionAcceptance: note.reactionAcceptance,
		visibleUserIds: note.visibility === 'specified' ? note.visibleUserIds : undefined,
		renoteCount: note.renoteCount,
		repliesCount: note.repliesCount,
		reactionCount: Object.values(reactions).reduce((a, b) => a + b, 0),
		reactions,
		reactionEmojis,
		reactionAndUserPairCache: opts.withReactionAndUserPairCache ? reactionAndUserPairCache : undefined,
		emojis,
		tags: note.tags.length > 0 ? note.tags : undefined,
		fileIds: note.fileIds,
		files,
		replyId: note.replyId,
		renoteId: note.renoteId,
		channelId: note.channelId ?? undefined,
		channel: channel
			? {
					id: channel.id,
					name: channel.name,
					color: channel.color,
					isSensitive: channel.isSensitive,
					allowRenoteToExternal: channel.allowRenoteToExternal,
					userId: channel.userId,
				}
			: undefined,
		mentions: note.mentions.length > 0 ? note.mentions : undefined,
		hasPoll: note.hasPoll || undefined,
		uri: note.uri ?? undefined,
		url: note.url ?? undefined,
		...(opts.detail
			? {
					clippedCount: note.clippedCount,
					reply: note.replyId ? reply : undefined,
					renote: note.renoteId ? renote : undefined,
					poll: note.hasPoll ? poll : undefined,
					...(meId && Object.keys(reactions).length > 0 ? { myReaction } : {}),
				}
			: {}),
	} satisfies Packed<'Note'>;

	treatVisibility(packed);

	if (
		!opts.skipHide &&
		(await shouldHideNote(deps, packed, meId, opts.hint?.followeeIds, opts.hint?.followeeIdCoverage))
	) {
		hideNote(packed);
	}

	return packed;
}

type PackNoteTargets = {
	targetById: Map<MiNote['id'], MiNote>;
	targets: MiNote[];
	detailTargetIds: Set<MiNote['id']>;
	pollTargetIds: MiNote['id'][];
};

export function collectPackNoteTargets(notes: MiNote[], detail: boolean): PackNoteTargets {
	// relation 未ロードの reply/renote は packNote 内で個別取得する。
	const targetById = new Map<MiNote['id'], MiNote>();
	const detailTargetIds = new Set<MiNote['id']>();
	const addTarget = (note: MiNote, packDetail: boolean): void => {
		targetById.set(note.id, note);
		if (!packDetail || detailTargetIds.has(note.id)) {
			return;
		}

		detailTargetIds.add(note.id);
		if (note.reply) {
			addTarget(note.reply, false);
		}
		if (note.renote) {
			addTarget(note.renote, true);
		}
	};
	for (const note of notes) {
		addTarget(note, detail);
	}
	const targets = [...targetById.values()];
	const pollTargetIds = targets
		.filter((target) => detailTargetIds.has(target.id) && target.hasPoll)
		.map((target) => target.id);

	return { targetById, targets, detailTargetIds, pollTargetIds };
}

type PackNoteStaticHint = Pick<
	PackNoteBatchHint,
	'noteIds' | 'polls' | 'reactionEmojis' | 'emojis' | 'packedUsers' | 'packedFiles' | 'channels'
>;

export async function buildPackNoteStaticHint(
	deps: NoteDependencies,
	targetInfo: PackNoteTargets,
): Promise<PackNoteStaticHint> {
	const { targetById, targets, pollTargetIds } = targetInfo;
	const polls = await listPollsByNoteIdsFromDatabase(deps.db, pollTargetIds);

	const userSrcById = new Map<MiUser['id'], MiUser['id'] | MiUser>();
	const fileIds = new Set<string>();
	const channelIds = new Set<string>();
	const emojiRequests: { emojiNames: string[]; noteUserHost: string | null }[] = [];
	for (const target of targets) {
		const existing = userSrcById.get(target.userId);
		if (existing == null || typeof existing === 'string') {
			userSrcById.set(target.userId, target.user ?? target.userId);
		}
		for (const fileId of target.fileIds) {
			fileIds.add(fileId);
		}
		if (target.channelId) {
			channelIds.add(target.channelId);
		}
		const reactions = normalizeReactionKeys(target.reactions);
		emojiRequests.push({ emojiNames: collectReactionEmojiNames(reactions), noteUserHost: target.userHost });
		emojiRequests.push({ emojiNames: target.userHost != null ? target.emojis : [], noteUserHost: target.userHost });
	}

	const [packedUserArray, packedFileArray, channelArray, populatedEmojiArray] = await Promise.all([
		packUserLiteMany(deps, [...userSrcById.values()]),
		packDriveFileManyByIds(deps, [...fileIds]),
		channelIds.size > 0 ? listChannelsByIdsFromDatabase(deps.db, [...channelIds]) : Promise.resolve([]),
		populateEmojisMany(deps, emojiRequests),
	]);

	return {
		noteIds: new Set(targetById.keys()),
		polls: new Map(polls.map((poll) => [poll.noteId, poll])),
		reactionEmojis: new Map(targets.map((target, index) => [target.id, populatedEmojiArray[index * 2]!])),
		emojis: new Map(
			targets.map((target, index) => [
				target.id,
				target.userHost != null ? populatedEmojiArray[index * 2 + 1]! : undefined,
			]),
		),
		packedUsers: new Map(packedUserArray.map((user) => [user.id, user])),
		packedFiles: new Map(packedFileArray.map((file) => [file.id, file])),
		channels: new Map(channelArray.map((channel) => [channel.id, channel])),
	};
}

export async function createPackNoteStaticHint(
	deps: NoteDependencies,
	notes: MiNote[],
	options?: { detail?: boolean },
): Promise<PackNoteBatchHint> {
	const targetInfo = collectPackNoteTargets(notes, options?.detail ?? true);
	const staticHint = await buildPackNoteStaticHint(deps, targetInfo);

	return {
		...staticHint,
		myReactions: new Map(),
		pollVotes: new Map(),
		pollVoteNoteIds: new Set(),
	};
}

export async function createPackNoteHintsForUsers(
	deps: NoteDependencies,
	notes: MiNote[],
	userIds: MiUser['id'][],
	options?: {
		detail?: boolean;
		skipHide?: boolean;
		staticHint?: PackNoteBatchHint;
	},
): Promise<Map<MiUser['id'], PackNoteBatchHint>> {
	const uniqueUserIds = [...new Set(userIds)];
	if (uniqueUserIds.length === 0 || notes.length === 0) {
		return new Map();
	}

	const detail = options?.detail ?? true;
	const targetInfo = collectPackNoteTargets(notes, detail);
	const { targets, detailTargetIds, pollTargetIds } = targetInfo;
	const staticHint = options?.staticHint ?? (await createPackNoteStaticHint(deps, notes, { detail }));
	const reactionLookupNoteIds: MiNote['id'][] = [];
	// 利用者に依らない値は投稿ごとに 1 度だけ求める。利用者 (最大 1,000 人) ごとに求め直すと、
	// 利用者数 × 投稿数 × リアクションの種類数になる。
	const reactionStates = new Map<MiNote['id'], { reactionsCount: number; pairCache: string[]; recent: boolean }>();
	const now = Date.now();
	for (const target of targets) {
		if (!detailTargetIds.has(target.id)) {
			continue;
		}
		const reactions = normalizeReactionKeys(target.reactions);
		const reactionsCount = Object.values(reactions).reduce((a, b) => a + b, 0);
		const pairCache = target.reactionAndUserPairCache ?? [];
		const recent = parseId(target.id).date.getTime() + 2000 > now;
		reactionStates.set(target.id, { reactionsCount, pairCache, recent });
		if (reactionsCount > 0 && reactionsCount > pairCache.length && !recent) {
			reactionLookupNoteIds.push(target.id);
		}
	}
	const followeeIdCoverage = !options?.skipHide
		? new Set(targets.filter((target) => target.visibility === 'followers').map((target) => target.userId))
		: undefined;

	const [reactionRows, pollVoteRows, followingRows] = await Promise.all([
		listNoteReactionsByNoteIdsAndUserIdsFromDatabase(deps.db, reactionLookupNoteIds, uniqueUserIds),
		listPollVotesByNoteIdsAndUserIdsFromDatabase(deps.db, pollTargetIds, uniqueUserIds),
		followeeIdCoverage != null
			? listFollowingsByFollowerIdsAndFolloweeIdsFromDatabase(deps.db, uniqueUserIds, [...followeeIdCoverage])
			: Promise.resolve([]),
	]);
	const reactionByUserId = new Map<MiUser['id'], Map<MiNote['id'], string>>();
	for (const row of reactionRows) {
		const reactions = reactionByUserId.get(row.userId) ?? new Map<MiNote['id'], string>();
		reactions.set(row.noteId, row.reaction);
		reactionByUserId.set(row.userId, reactions);
	}
	const pollVotesByUserId = new Map<MiUser['id'], Map<MiNote['id'], MiPollVote[]>>();
	for (const row of pollVoteRows) {
		const votesByNoteId = pollVotesByUserId.get(row.userId) ?? new Map<MiNote['id'], MiPollVote[]>();
		const votes = votesByNoteId.get(row.noteId) ?? [];
		votes.push(row);
		votesByNoteId.set(row.noteId, votes);
		pollVotesByUserId.set(row.userId, votesByNoteId);
	}
	const followeeIdsByFollowerId = new Map<MiUser['id'], Set<MiUser['id']>>();
	for (const row of followingRows) {
		const followeeIds = followeeIdsByFollowerId.get(row.followerId) ?? new Set<MiUser['id']>();
		followeeIds.add(row.followeeId);
		followeeIdsByFollowerId.set(row.followerId, followeeIds);
	}

	const pollVoteNoteIds = new Set(pollTargetIds);
	return new Map(
		uniqueUserIds.map((userId) => {
			const myReactions = new Map<MiNote['id'], string | undefined>();
			for (const [targetId, { reactionsCount, pairCache, recent }] of reactionStates) {
				if (reactionsCount === 0) {
					myReactions.set(targetId, undefined);
					continue;
				}
				if (reactionsCount <= pairCache.length) {
					const pair = pairCache.find((pair) => pair.startsWith(userId));
					myReactions.set(targetId, pair ? normalizeReactionKey(pair.split('/')[1]!) : undefined);
					continue;
				}
				if (recent) {
					myReactions.set(targetId, undefined);
					continue;
				}
				const reaction = reactionByUserId.get(userId)?.get(targetId);
				myReactions.set(targetId, reaction != null ? normalizeReactionKey(reaction) : undefined);
			}

			return [
				userId,
				{
					...staticHint,
					myReactions,
					pollVotes: pollVotesByUserId.get(userId) ?? new Map(),
					pollVoteNoteIds,
					...omitUndefined({
						followeeIds: followeeIdCoverage != null ? (followeeIdsByFollowerId.get(userId) ?? new Set()) : undefined,
						followeeIdCoverage,
					}),
				},
			];
		}),
	);
}

export async function fetchNoteDiffs(
	deps: NoteDependencies,
	notes: MiNote[],
): Promise<
	{ id: string; reactions: MiNote['reactions']; reactionEmojis: Record<string, string>; updatedAt?: string }[]
> {
	const diffs = notes.map((note) => {
		const reactions = normalizeReactionKeys(note.reactions);
		return { note, reactions, reactionEmojiNames: collectReactionEmojiNames(reactions) };
	});
	const reactionEmojis = await populateEmojisMany(
		deps,
		diffs.map((diff) => ({
			emojiNames: diff.reactionEmojiNames,
			noteUserHost: diff.note.userHost,
		})),
	);

	return diffs.map((diff, index) => ({
		id: diff.note.id,
		reactions: diff.reactions,
		reactionEmojis: reactionEmojis[index]!,
		// ポーリングで編集を見つけるため (リアルタイム購読を使わない表示向け)。
		...(diff.note.updatedAt == null ? {} : { updatedAt: new Date(diff.note.updatedAt).toISOString() }),
	}));
}
