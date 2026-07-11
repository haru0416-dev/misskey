/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII, URLSearchParams } from 'node:url';
import type * as Redis from 'ioredis';
import { z } from 'zod';
import { fetchChannelByIdFromDatabase, listChannelsByIdsFromDatabase } from '@/core/ChannelStore.js';
import { listActiveMutedChannelIdsByUserIdFromDatabase } from '@/core/ChannelMutingStore.js';
import { fetchEmojisByNamesAndHostsFromDatabaseCached } from '@/core/EmojiStore.js';
import { followingExistsInDatabase, listFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabase, listFollowingsByFollowerIdsAndFolloweeIdsFromDatabase } from '@/core/FollowingStore.js';
import { fetchNoteByIdFromDatabase, fetchNoteByIdOrFailFromDatabase, listFeaturedNotesByIdsFromDatabase, listUserTimelineNotesFromDatabase } from '@/core/NoteStore.js';
import { fetchNoteReactionByUserAndNoteFromDatabase, listNoteReactionsByNoteIdsAndUserIdsFromDatabase, listNoteReactionsByUserAndNoteIdsFromDatabase } from '@/core/NoteReactionStore.js';
import { fetchPollByNoteIdOrFailFromDatabase, listPollsByNoteIdsFromDatabase } from '@/core/PollStore.js';
import { fetchPollVoteByNoteAndUserFromDatabase, listPollVotesByNoteAndUserFromDatabase, listPollVotesByNoteIdsAndUserFromDatabase, listPollVotesByNoteIdsAndUserIdsFromDatabase } from '@/core/PollVoteStore.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import { listBlockerIdsByBlockeeIdFromDatabase } from '@/core/BlockingStore.js';
import { listMuteeIdsByMuterIdFromDatabase } from '@/core/MutingStore.js';
import type { Config } from '@/config.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import { isEntityNotFoundError } from '@/misc/db-errors.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { shouldHideNoteByTime } from '@/misc/should-hide-note-by-time.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import { isQuotePacked, isRenotePacked } from '@/misc/is-renote.js';
import { deepClone } from '@/misc/clone.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiNote } from '@/models/Note.js';
import type { MiPoll } from '@/models/Poll.js';
import type { MiPollVote } from '@/models/PollVote.js';
import type { MiUser } from '@/models/User.js';
import { packDriveFileManyByIdsForHonoApi, type HonoApiDriveFileDependencies } from './drive-file.js';
import { HonoApiError } from './error.js';
import { getHonoApiRolePolicies, type HonoApiRolePolicyDependencies } from './role-policy.js';
import { packUserLiteForHonoApi, packUserLiteManyForHonoApi, type UserPackingDependencies } from './user.js';
import { getFanoutTimelineNotesForHonoApi } from './fanout-timeline.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiNoteDependencies = HonoApiDriveFileDependencies & UserPackingDependencies & {
	redis: Redis.Redis;
	/** fanout タイムライン (Redis) 読み取りに必要。省略時は常にDBから読む。 */
	redisForTimelines?: Redis.Redis;
};

export type HonoApiEmojiPopulateDependencies = {
	config: Config;
	db: HonoApiNoteDependencies['db'];
};

const REACTIONS_BUFFER_DELTA_PREFIX = 'reactionsBufferDeltas';
const REACTIONS_BUFFER_PAIR_PREFIX = 'reactionsBufferPairs';

const decodeCustomEmojiRegexp = /^:([\w+-]+)(?:@([\w.-]+))?:$/;

function decodeReaction(str: string): { reaction: string; name?: string; host?: string | null } {
	const custom = str.match(decodeCustomEmojiRegexp);

	if (custom) {
		const name = custom[1];
		const host = custom[2] ?? null;

		return {
			reaction: `:${name}@${host ?? '.'}:`,
			name,
			host,
		};
	}

	return { reaction: str, name: undefined, host: undefined };
}

function normalizeReactionKey(reaction: string): string {
	return decodeReaction(reaction).reaction;
}

function normalizeReactionKeys(reactions: MiNote['reactions']): MiNote['reactions'] {
	return Object.entries(reactions)
		.filter(([, count]) => count > 0)
		.map(([reaction, count]) => [normalizeReactionKey(reaction), count] as const)
		.reduce<MiNote['reactions']>((acc, [key, count]) => {
			acc[key] = (acc[key] ?? 0) + count;
			return acc;
		}, {});
}

function collectReactionEmojiNames(reactions: MiNote['reactions']): string[] {
	return Object.keys(reactions)
		.filter(reaction => reaction.startsWith(':') && reaction.includes('@') && !reaction.includes('@.'))
		.map(reaction => decodeReaction(reaction).reaction.replaceAll(':', ''));
}

function mergeReactions(src: MiNote['reactions'], delta: Record<string, number>): MiNote['reactions'] {
	const reactions = { ...src };
	for (const [name, count] of Object.entries(delta)) {
		reactions[name] = (reactions[name] ?? 0) + count;
	}
	return reactions;
}

async function getBufferedReactions(
	deps: HonoApiNoteDependencies,
	noteId: MiNote['id'],
): Promise<{ deltas: Record<string, number>; pairs: [MiUser['id'], string][] }> {
	if (!deps.meta.enableReactionsBuffering) return { deltas: {}, pairs: [] };

	const pipeline = deps.redis.pipeline();
	pipeline.hgetall(`${REACTIONS_BUFFER_DELTA_PREFIX}:${noteId}`);
	pipeline.zrange(`${REACTIONS_BUFFER_PAIR_PREFIX}:${noteId}`, 0, -1);
	const results = await pipeline.exec();

	const resultDeltas = (results?.[0]?.[1] ?? {}) as Record<string, string>;
	const resultPairs = (results?.[1]?.[1] ?? []) as string[];

	const deltas: Record<string, number> = {};
	for (const [name, count] of Object.entries(resultDeltas)) {
		deltas[name] = parseInt(count, 10);
	}

	const pairs = resultPairs.map(x => x.split('/') as [MiUser['id'], string]);

	return { deltas, pairs };
}

async function getBufferedReactionsMany(
	deps: HonoApiNoteDependencies,
	noteIds: MiNote['id'][],
): Promise<Map<MiNote['id'], { deltas: Record<string, number>; pairs: [MiUser['id'], string][] }>> {
	const result = new Map<MiNote['id'], { deltas: Record<string, number>; pairs: [MiUser['id'], string][] }>(
		noteIds.map(id => [id, { deltas: {}, pairs: [] }]),
	);
	if (!deps.meta.enableReactionsBuffering || noteIds.length === 0) return result;

	const pipeline = deps.redis.pipeline();
	for (const noteId of noteIds) {
		pipeline.hgetall(`${REACTIONS_BUFFER_DELTA_PREFIX}:${noteId}`);
		pipeline.zrange(`${REACTIONS_BUFFER_PAIR_PREFIX}:${noteId}`, 0, -1);
	}
	const results = await pipeline.exec();

	for (let i = 0; i < noteIds.length; i++) {
		const resultDeltas = (results?.[i * 2]?.[1] ?? {}) as Record<string, string>;
		const resultPairs = (results?.[i * 2 + 1]?.[1] ?? []) as string[];

		const deltas: Record<string, number> = {};
		for (const [name, count] of Object.entries(resultDeltas)) {
			deltas[name] = parseInt(count, 10);
		}

		result.set(noteIds[i]!, {
			deltas,
			pairs: resultPairs.map(x => x.split('/') as [MiUser['id'], string]),
		});
	}

	return result;
}

function toPuny(host: string): string {
	return domainToASCII(host.toLowerCase());
}

function toPunyNullable(host: string | null | undefined): string | null {
	if (host == null) return null;
	return domainToASCII(host.toLowerCase());
}

function isSelfHost(config: Config, host: string | null): boolean {
	if (host == null) return true;
	return toPuny(config.host) === toPuny(host);
}

const parseEmojiStrRegexp = /^([-\w]+)(?:@([\w.-]+))?$/;

function normalizeEmojiHost(config: Config, src: string | undefined, noteUserHost: string | null): string | null {
	const host = src === '.' ? null
		: src === undefined ? noteUserHost
			: isSelfHost(config, src) ? null
				: (src || noteUserHost);
	return toPunyNullable(host);
}

function parseEmojiStr(config: Config, emojiName: string, noteUserHost: string | null): { name: string | null; host: string | null } {
	const match = emojiName.match(parseEmojiStrRegexp);
	if (!match) return { name: null, host: null };

	const name = match[1]!;
	const host = normalizeEmojiHost(config, match[2], noteUserHost);

	return { name, host };
}

export async function populateEmojis(
	deps: HonoApiEmojiPopulateDependencies,
	emojiNames: string[],
	noteUserHost: string | null,
): Promise<Record<string, string>> {
	return (await populateEmojisMany(deps, [{ emojiNames, noteUserHost }]))[0]!;
}

export async function populateEmojisMany(
	deps: HonoApiEmojiPopulateDependencies,
	requests: readonly { emojiNames: readonly string[]; noteUserHost: string | null }[],
): Promise<Record<string, string>[]> {
	const refs: { requestIndex: number; emojiName: string; name: string; host: string }[] = [];
	for (let requestIndex = 0; requestIndex < requests.length; requestIndex++) {
		const request = requests[requestIndex]!;
		for (const emojiName of new Set(request.emojiNames)) {
			const { name, host } = parseEmojiStr(deps.config, emojiName, request.noteUserHost);
			if (name == null || host == null) continue;
			refs.push({ requestIndex, emojiName, name, host });
		}
	}

	const emojis = await fetchEmojisByNamesAndHostsFromDatabaseCached(
		deps.db,
		refs.map(ref => ({ name: ref.name, host: ref.host })),
	);
	const results = requests.map(() => ({} as Record<string, string>));
	for (let i = 0; i < refs.length; i++) {
		const emoji = emojis[i];
		if (emoji == null) continue;
		results[refs[i]!.requestIndex]![refs[i]!.emojiName] = emoji.publicUrl || emoji.originalUrl;
	}

	return results;
}

async function nullIfEntityNotFound<T>(promise: Promise<T>): Promise<T | null> {
	try {
		return await promise;
	} catch (err) {
		if (isEntityNotFoundError(err)) return null;
		throw err;
	}
}

async function populatePoll(
	deps: HonoApiNoteDependencies,
	note: MiNote,
	meId: MiUser['id'] | null,
	hint?: {
		poll: MiPoll;
		votes?: MiPollVote[];
	},
): Promise<{ multiple: boolean; expiresAt: string | null; choices: { text: string; votes: number; isVoted: boolean }[] }> {
	const poll = hint?.poll ?? await fetchPollByNoteIdOrFailFromDatabase(deps.db, note.id);
	const choices = poll.choices.map(c => ({
		text: c,
		votes: poll.votes[poll.choices.indexOf(c)]!,
		isVoted: false,
	}));

	if (meId) {
		const votes = hint?.votes ?? (poll.multiple
			? await listPollVotesByNoteAndUserFromDatabase(deps.db, note.id, meId)
			: [await fetchPollVoteByNoteAndUserFromDatabase(deps.db, note.id, meId)].filter((vote): vote is MiPollVote => vote != null));
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

export async function populateMyReactionForHonoApi(
	deps: HonoApiNoteDependencies,
	note: { id: MiNote['id']; reactions: MiNote['reactions']; reactionAndUserPairCache: MiNote['reactionAndUserPairCache'] },
	meId: MiUser['id'],
): Promise<string | undefined> {
	const reactionsCount = Object.values(note.reactions).reduce((a, b) => a + b, 0);
	if (reactionsCount === 0) return undefined;

	if (note.reactionAndUserPairCache && reactionsCount <= note.reactionAndUserPairCache.length) {
		const pair = note.reactionAndUserPairCache.find(p => p.startsWith(meId));
		if (pair) return normalizeReactionKey(pair.split('/')[1]!);
		return undefined;
	}

	if (parseId(note.id).date.getTime() + 2000 > Date.now()) return undefined;

	const reaction = await fetchNoteReactionByUserAndNoteFromDatabase(deps.db, meId, note.id);
	if (reaction) return normalizeReactionKey(reaction.reaction);

	return undefined;
}

function treatVisibility(packedNote: Packed<'Note'>): Packed<'Note'>['visibility'] {
	if (packedNote.visibility === 'public' || packedNote.visibility === 'home') {
		const followersOnlyBefore = (packedNote.user as { makeNotesFollowersOnlyBefore?: number | null }).makeNotesFollowersOnlyBefore;
		if (shouldHideNoteByTime(followersOnlyBefore, packedNote.createdAt)) {
			packedNote.visibility = 'followers';
		}
	}
	return packedNote.visibility;
}

export async function shouldHideNoteForHonoApi(
	deps: HonoApiNoteDependencies,
	packedNote: Packed<'Note'>,
	meId: MiUser['id'] | null,
	followeeIds?: Set<MiUser['id']>,
	followeeIdCoverage?: Set<MiUser['id']>,
): Promise<boolean> {
	if (meId === packedNote.userId) return false;

	const user = packedNote.user as { requireSigninToViewContents?: boolean; makeNotesHiddenBefore?: number | null };
	if (user.requireSigninToViewContents && meId == null) return true;

	if (shouldHideNoteByTime(user.makeNotesHiddenBefore, packedNote.createdAt)) return true;

	if (packedNote.visibility === 'specified') {
		if (meId == null) return true;
		const specified = packedNote.visibleUserIds?.some(id => meId === id);
		if (!specified) return true;
	}

	if (packedNote.visibility === 'followers') {
		if (meId == null) return true;
		if (packedNote.reply && meId === packedNote.reply.userId) return false;
		if (packedNote.mentions?.some(id => meId === id)) return false;

		// followeeIds が全フォロー先、または coverage に含まれる対象者の照会結果なら再利用する。
		const canUseHint = followeeIds != null && (followeeIdCoverage == null || followeeIdCoverage.has(packedNote.userId));
		const isFollowing = canUseHint ? followeeIds.has(packedNote.userId) : await followingExistsInDatabase(deps.db, meId, packedNote.userId);
		if (!isFollowing) return true;
	}

	return false;
}

export function hideNoteForHonoApi(packedNote: Packed<'Note'>): void {
	packedNote.visibleUserIds = undefined;
	packedNote.fileIds = [];
	packedNote.files = [];
	packedNote.text = null;
	packedNote.poll = undefined;
	packedNote.cw = null;
	packedNote.isHidden = true;
}

function collectRenoteChainForHonoApi(note: Packed<'Note'>): Packed<'Note'>[] {
	const renoteChain: Packed<'Note'>[] = [];
	for (let current: Packed<'Note'> | null | undefined = note; current != null; current = current.renote) {
		renoteChain.push(current);
	}
	return renoteChain;
}

/**
 * NoteStreamingHidingService.filter 相当。ストリーミング配信用にノートの内容を隠す
 * (あるいはそもそも送信しない) 判定及び処理を行う。
 */
export async function filterNoteForStreamingHidingForHonoApi(
	deps: HonoApiNoteDependencies,
	note: Packed<'Note'>,
	meId: MiUser['id'] | null,
): Promise<Packed<'Note'> | null> {
	const renoteChain = collectRenoteChainForHonoApi(note);
	const shouldHide = await Promise.all(renoteChain.map(n => shouldHideNoteForHonoApi(deps, n, meId)));

	if (!shouldHide.some(h => h)) {
		return note;
	}

	if (renoteChain.some(n => isRenotePacked(n) && !isQuotePacked(n))) {
		// 純粋リノートの場合は配信をスキップする
		return null;
	}

	const clonedNote = deepClone(note);
	let currentCloned: Packed<'Note'> | undefined = clonedNote;

	for (let i = 0; i < renoteChain.length; i++) {
		if (shouldHide[i] && currentCloned) {
			hideNoteForHonoApi(currentCloned);
		}
		currentCloned = currentCloned?.renote ?? undefined;
	}

	return clonedNote;
}

export async function isVisibleForMeForHonoApi(
	deps: HonoApiNoteDependencies,
	note: MiNote,
	meId: MiUser['id'] | null,
): Promise<boolean> {
	if (note.visibility === 'specified') {
		if (meId == null) return false;
		if (meId === note.userId) return true;
		return note.visibleUserIds.some(id => meId === id);
	}

	if (note.visibility === 'followers') {
		if (meId == null) return false;
		if (meId === note.userId) return true;
		if (note.reply && meId === note.reply.userId) return true;
		if (note.mentions?.some(id => meId === id)) return true;

		const [isFollowing, user] = await Promise.all([
			followingExistsInDatabase(deps.db, meId, note.userId),
			fetchUserByIdOrFailFromDatabase(deps.db, meId),
		]);
		return isFollowing || (note.userHost != null && user.host != null);
	}

	return true;
}

type PackNoteChannel = NonNullable<Awaited<ReturnType<typeof fetchChannelByIdFromDatabase>>>;

/**
 * packNoteManyForHonoApi が事前一括取得した結果。`noteIds` に含まれるノートについてのみ
 * 各 Map の内容を信頼してよい (含まれないノートは従来どおり個別取得にフォールバックする)。
 */
export type PackNoteBatchHint = {
	noteIds: Set<MiNote['id']>;
	bufferedReactions: Map<MiNote['id'], { deltas: Record<string, number>; pairs: [MiUser['id'], string][] }>;
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

export async function packNoteForHonoApi(
	deps: HonoApiNoteDependencies,
	src: MiNote['id'] | MiNote,
	me: { id: MiUser['id'] } | null | undefined,
	options?: {
		detail?: boolean;
		skipHide?: boolean;
		withReactionAndUserPairCache?: boolean;
		hint?: PackNoteBatchHint;
	},
): Promise<Packed<'Note'>> {
	const opts = Object.assign({
		detail: true,
		skipHide: false,
		withReactionAndUserPairCache: false,
	}, options);

	const meId = me ? me.id : null;
	const note = typeof src === 'object' ? src : await fetchNoteByIdOrFailFromDatabase(deps.db, src);
	const host = note.userHost;

	// hint は事前一括取得の対象だったノートに対してのみ信頼できる
	const hint = opts.hint != null && opts.hint.noteIds.has(note.id) ? opts.hint : undefined;

	const bufferedReactions = hint?.bufferedReactions.get(note.id) ?? await getBufferedReactions(deps, note.id);
	const reactions = normalizeReactionKeys(mergeReactions(note.reactions, bufferedReactions.deltas));
	const reactionAndUserPairCache = note.reactionAndUserPairCache.concat(bufferedReactions.pairs.map(x => x.join('/')));

	let text = note.text;
	if (note.name && (note.url ?? note.uri)) {
		text = `【${note.name}】\n${(note.text ?? '').trim()}\n\n${note.url ?? note.uri}`;
	}

	const reactionEmojiNames = collectReactionEmojiNames(reactions);

	const [user, files, reactionEmojis, emojis, channel, reply, renote, poll, myReaction] = await Promise.all([
		hint?.packedUsers.get(note.userId) ?? packUserLiteForHonoApi(deps, note.user ?? note.userId),
		hint != null
			? note.fileIds.map(id => hint.packedFiles.get(id)).filter((f): f is Packed<'DriveFile'> => f != null)
			: packDriveFileManyByIdsForHonoApi(deps, note.fileIds),
		hint?.reactionEmojis.get(note.id) ?? populateEmojis(deps, reactionEmojiNames, host),
		hint?.emojis.has(note.id)
			? hint.emojis.get(note.id)
			: (host != null ? populateEmojis(deps, note.emojis, host) : Promise.resolve(undefined)),
		note.channelId
			? (hint != null ? (hint.channels.get(note.channelId) ?? null) : fetchChannelByIdFromDatabase(deps.db, note.channelId))
			: Promise.resolve(null),
		(opts.detail && note.replyId) ? nullIfEntityNotFound(packNoteForHonoApi(deps, note.reply ?? note.replyId, me, {
			detail: false,
			skipHide: opts.skipHide,
			withReactionAndUserPairCache: opts.withReactionAndUserPairCache,
			hint: opts.hint,
		})) : Promise.resolve(undefined),
		(opts.detail && note.renoteId) ? nullIfEntityNotFound(packNoteForHonoApi(deps, note.renote ?? note.renoteId, me, {
			detail: true,
			skipHide: opts.skipHide,
			withReactionAndUserPairCache: opts.withReactionAndUserPairCache,
			hint: opts.hint,
		})) : Promise.resolve(undefined),
		(opts.detail && note.hasPoll) ? populatePoll(deps, note, meId, hint?.polls.has(note.id) ? {
			poll: hint.polls.get(note.id)!,
			...(hint.pollVoteNoteIds.has(note.id) ? { votes: hint.pollVotes.get(note.id) ?? [] } : {}),
		} : undefined) : Promise.resolve(undefined),
		(opts.detail && meId && Object.keys(reactions).length > 0)
			? (hint?.myReactions.has(note.id)
				? hint.myReactions.get(note.id)
				: populateMyReactionForHonoApi(deps, {
					id: note.id,
					reactions,
					reactionAndUserPairCache,
				}, meId))
			: Promise.resolve(undefined),
	]);

	const packed = {
		id: note.id,
		createdAt: parseId(note.id).date.toISOString(),
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
		channel: channel ? {
			id: channel.id,
			name: channel.name,
			color: channel.color,
			isSensitive: channel.isSensitive,
			allowRenoteToExternal: channel.allowRenoteToExternal,
			userId: channel.userId,
		} : undefined,
		mentions: note.mentions.length > 0 ? note.mentions : undefined,
		hasPoll: note.hasPoll || undefined,
		uri: note.uri ?? undefined,
		url: note.url ?? undefined,
		...(opts.detail ? {
			clippedCount: note.clippedCount,
			reply: note.replyId ? reply : undefined,
			renote: note.renoteId ? renote : undefined,
			poll: note.hasPoll ? poll : undefined,
			...(meId && Object.keys(reactions).length > 0 ? { myReaction } : {}),
		} : {}),
	} satisfies Packed<'Note'>;

	treatVisibility(packed);

	if (!opts.skipHide && await shouldHideNoteForHonoApi(deps, packed, meId, opts.hint?.followeeIds, opts.hint?.followeeIdCoverage)) {
		hideNoteForHonoApi(packed);
	}

	return packed;
}

type PackNoteTargets = {
	targetById: Map<MiNote['id'], MiNote>;
	targets: MiNote[];
	detailTargetIds: Set<MiNote['id']>;
	pollTargetIds: MiNote['id'][];
};

function collectPackNoteTargets(notes: MiNote[], detail: boolean): PackNoteTargets {
	// 本体 + relation ロード済みの reply/renote を事前一括取得の対象にする
	// (relation 未ロードのノートは packNoteForHonoApi 内の個別取得にフォールバックする)
	const targetById = new Map<MiNote['id'], MiNote>();
	const detailTargetIds = new Set<MiNote['id']>();
	const addTarget = (note: MiNote, packDetail: boolean): void => {
		targetById.set(note.id, note);
		if (!packDetail || detailTargetIds.has(note.id)) return;

		detailTargetIds.add(note.id);
		if (note.reply) addTarget(note.reply, false);
		if (note.renote) addTarget(note.renote, true);
	};
	for (const note of notes) {
		addTarget(note, detail);
	}
	const targets = [...targetById.values()];
	const pollTargetIds = targets
		.filter(target => detailTargetIds.has(target.id) && target.hasPoll)
		.map(target => target.id);

	return { targetById, targets, detailTargetIds, pollTargetIds };
}

type PackNoteStaticHint = Pick<PackNoteBatchHint,
	'noteIds' | 'bufferedReactions' | 'polls' | 'reactionEmojis' | 'emojis' | 'packedUsers' | 'packedFiles' | 'channels'>;

async function buildPackNoteStaticHint(
	deps: HonoApiNoteDependencies,
	targetInfo: PackNoteTargets,
): Promise<PackNoteStaticHint> {
	const { targetById, targets, pollTargetIds } = targetInfo;
	const [bufferedReactions, polls] = await Promise.all([
		getBufferedReactionsMany(deps, targets.map(target => target.id)),
		listPollsByNoteIdsFromDatabase(deps.db, pollTargetIds),
	]);

	const userSrcById = new Map<MiUser['id'], MiUser['id'] | MiUser>();
	const fileIds = new Set<string>();
	const channelIds = new Set<string>();
	const emojiRequests: { emojiNames: string[]; noteUserHost: string | null }[] = [];
	for (const target of targets) {
		const existing = userSrcById.get(target.userId);
		if (existing == null || typeof existing === 'string') {
			userSrcById.set(target.userId, target.user ?? target.userId);
		}
		for (const fileId of target.fileIds) fileIds.add(fileId);
		if (target.channelId) channelIds.add(target.channelId);
		const buffered = bufferedReactions.get(target.id)!;
		const reactions = normalizeReactionKeys(mergeReactions(target.reactions, buffered.deltas));
		emojiRequests.push({ emojiNames: collectReactionEmojiNames(reactions), noteUserHost: target.userHost });
		emojiRequests.push({ emojiNames: target.userHost != null ? target.emojis : [], noteUserHost: target.userHost });
	}

	const [packedUserArray, packedFileArray, channelArray, populatedEmojiArray] = await Promise.all([
		packUserLiteManyForHonoApi(deps, [...userSrcById.values()]),
		packDriveFileManyByIdsForHonoApi(deps, [...fileIds]),
		channelIds.size > 0 ? listChannelsByIdsFromDatabase(deps.db, [...channelIds]) : Promise.resolve([]),
		populateEmojisMany(deps, emojiRequests),
	]);

	return {
		noteIds: new Set(targetById.keys()),
		bufferedReactions,
		polls: new Map(polls.map(poll => [poll.noteId, poll])),
		reactionEmojis: new Map(targets.map((target, index) => [target.id, populatedEmojiArray[index * 2]!])),
		emojis: new Map(targets.map((target, index) => [target.id, target.userHost != null ? populatedEmojiArray[index * 2 + 1]! : undefined])),
		packedUsers: new Map(packedUserArray.map(user => [user.id, user])),
		packedFiles: new Map(packedFileArray.map(file => [file.id, file])),
		channels: new Map(channelArray.map(channel => [channel.id, channel])),
	};
}

export async function createPackNoteStaticHintForHonoApi(
	deps: HonoApiNoteDependencies,
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

export async function createPackNoteHintsForUsersForHonoApi(
	deps: HonoApiNoteDependencies,
	notes: MiNote[],
	userIds: MiUser['id'][],
	options?: {
		detail?: boolean;
		skipHide?: boolean;
		staticHint?: PackNoteBatchHint;
	},
): Promise<Map<MiUser['id'], PackNoteBatchHint>> {
	const uniqueUserIds = [...new Set(userIds)];
	if (uniqueUserIds.length === 0 || notes.length === 0) return new Map();

	const detail = options?.detail ?? true;
	const targetInfo = collectPackNoteTargets(notes, detail);
	const { targets, detailTargetIds, pollTargetIds } = targetInfo;
	const staticHint = options?.staticHint ?? await createPackNoteStaticHintForHonoApi(deps, notes, { detail });
	const reactionLookupNoteIds: MiNote['id'][] = [];
	for (const target of targets) {
		if (!detailTargetIds.has(target.id)) continue;
		const buffered = staticHint.bufferedReactions.get(target.id)!;
		const reactions = normalizeReactionKeys(mergeReactions(target.reactions, buffered.deltas));
		const reactionsCount = Object.values(reactions).reduce((a, b) => a + b, 0);
		const pairCache = (target.reactionAndUserPairCache ?? []).concat(buffered.pairs.map(pair => pair.join('/')));
		if (reactionsCount > 0 && reactionsCount > pairCache.length && parseId(target.id).date.getTime() + 2000 <= Date.now()) {
			reactionLookupNoteIds.push(target.id);
		}
	}
	const followeeIdCoverage = !options?.skipHide
		? new Set(targets.filter(target => target.visibility === 'followers').map(target => target.userId))
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

	return new Map(uniqueUserIds.map(userId => {
		const myReactions = new Map<MiNote['id'], string | undefined>();
		for (const target of targets) {
			if (!detailTargetIds.has(target.id)) continue;
			const buffered = staticHint.bufferedReactions.get(target.id)!;
			const reactions = normalizeReactionKeys(mergeReactions(target.reactions, buffered.deltas));
			const reactionsCount = Object.values(reactions).reduce((a, b) => a + b, 0);
			if (reactionsCount === 0) {
				myReactions.set(target.id, undefined);
				continue;
			}
			const pairCache = (target.reactionAndUserPairCache ?? []).concat(buffered.pairs.map(pair => pair.join('/')));
			if (reactionsCount <= pairCache.length) {
				const pair = pairCache.find(pair => pair.startsWith(userId));
				myReactions.set(target.id, pair ? normalizeReactionKey(pair.split('/')[1]!) : undefined);
				continue;
			}
			if (parseId(target.id).date.getTime() + 2000 > Date.now()) {
				myReactions.set(target.id, undefined);
				continue;
			}
			const reaction = reactionByUserId.get(userId)?.get(target.id);
			myReactions.set(target.id, reaction != null ? normalizeReactionKey(reaction) : undefined);
		}

		return [userId, {
			...staticHint,
			myReactions,
			pollVotes: pollVotesByUserId.get(userId) ?? new Map(),
			pollVoteNoteIds: new Set(pollTargetIds),
			followeeIds: followeeIdCoverage != null ? (followeeIdsByFollowerId.get(userId) ?? new Set()) : undefined,
			followeeIdCoverage,
		}];
	}));
}

export async function packNoteManyForHonoApi(
	deps: HonoApiNoteDependencies,
	notes: MiNote[],
	me: { id: MiUser['id'] } | null | undefined,
	options?: {
		detail?: boolean;
		skipHide?: boolean;
		followeeIds?: Set<MiUser['id']>;
	},
): Promise<Packed<'Note'>[]> {
	if (notes.length === 0) return [];

	const detail = options?.detail ?? true;
	const meId = me ? me.id : null;
	const targetInfo = collectPackNoteTargets(notes, detail);
	const { targets, detailTargetIds, pollTargetIds } = targetInfo;
	const followeeIdCoverage = options?.followeeIds == null && meId != null && !options?.skipHide
		? new Set(targets.filter(target => target.visibility === 'followers' && target.userId !== meId).map(target => target.userId))
		: undefined;

	const [staticHint, pollVotes, packedFolloweeIds] = await Promise.all([
		buildPackNoteStaticHint(deps, targetInfo),
		meId != null
			? listPollVotesByNoteIdsAndUserFromDatabase(deps.db, pollTargetIds, meId)
			: Promise.resolve([]),
		followeeIdCoverage != null && meId != null
			? listFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabase(deps.db, meId, [...followeeIdCoverage])
			: Promise.resolve([]),
	]);

	// myReaction: populateMyReactionForHonoApi と同じ判定で pair cache から解決し、
	// DB 参照が必要なノートだけ IN 句 1 クエリでまとめて引く
	const myReactions = new Map<MiNote['id'], string | undefined>();
	if (meId != null && detail) {
		const idsNeedingDbLookup: MiNote['id'][] = [];
		for (const target of targets) {
			if (!detailTargetIds.has(target.id)) continue;
			const buffered = staticHint.bufferedReactions.get(target.id)!;
			const reactions = normalizeReactionKeys(mergeReactions(target.reactions, buffered.deltas));
			const reactionsCount = Object.values(reactions).reduce((a, b) => a + b, 0);
			if (reactionsCount === 0) {
				myReactions.set(target.id, undefined);
				continue;
			}
			const pairCache = (target.reactionAndUserPairCache ?? []).concat(buffered.pairs.map(x => x.join('/')));
			if (reactionsCount <= pairCache.length) {
				const pair = pairCache.find(pair => pair.startsWith(meId));
				myReactions.set(target.id, pair ? normalizeReactionKey(pair.split('/')[1]!) : undefined);
				continue;
			}
			if (parseId(target.id).date.getTime() + 2000 > Date.now()) {
				myReactions.set(target.id, undefined);
				continue;
			}
			idsNeedingDbLookup.push(target.id);
		}
		if (idsNeedingDbLookup.length > 0) {
			const rows = await listNoteReactionsByUserAndNoteIdsFromDatabase(deps.db, meId, idsNeedingDbLookup);
			const reactionByNoteId = new Map(rows.map(row => [row.noteId, row.reaction]));
			for (const id of idsNeedingDbLookup) {
				const reaction = reactionByNoteId.get(id);
				myReactions.set(id, reaction != null ? normalizeReactionKey(reaction) : undefined);
			}
		}
	}

	const hint: PackNoteBatchHint = {
		...staticHint,
		myReactions,
		pollVotes: Map.groupBy(pollVotes, vote => vote.noteId),
		pollVoteNoteIds: meId != null ? new Set(pollTargetIds) : new Set(),
		followeeIds: options?.followeeIds ?? (followeeIdCoverage != null ? new Set(packedFolloweeIds) : undefined),
		followeeIdCoverage,
	};

	return await Promise.all(notes.map(note => packNoteForHonoApi(deps, note, me, { ...options, hint })));
}

export async function fetchNoteDiffsForHonoApi(
	deps: HonoApiNoteDependencies,
	notes: MiNote[],
): Promise<{ id: string; reactions: MiNote['reactions']; reactionEmojis: Record<string, string> }[]> {
	const bufferedReactionsByNoteId = await getBufferedReactionsMany(deps, notes.map(note => note.id));
	const diffs = notes.map(note => {
		const bufferedReactions = bufferedReactionsByNoteId.get(note.id)!;
		const reactions = normalizeReactionKeys(mergeReactions(note.reactions, bufferedReactions.deltas));
		return { note, reactions, reactionEmojiNames: collectReactionEmojiNames(reactions) };
	});
	const reactionEmojis = await populateEmojisMany(deps, diffs.map(diff => ({
		emojiNames: diff.reactionEmojiNames,
		noteUserHost: diff.note.userHost,
	})));

	return diffs.map((diff, index) => ({
		id: diff.note.id,
		reactions: diff.reactions,
		reactionEmojis: reactionEmojis[index]!,
	}));
}

const FEATURED_EPOCH = new Date('2023-01-01T00:00:00Z').getTime();
const PER_USER_NOTES_RANKING_WINDOW = 1000 * 60 * 60 * 24 * 7;

function getFeaturedRankingCurrentWindowForHonoApi(windowRange: number): number {
	const passed = new Date().getTime() - FEATURED_EPOCH;
	return Math.floor(passed / windowRange);
}

async function getFeaturedRankingOfForHonoApi(
	redis: Redis.Redis,
	name: string,
	windowRange: number,
	threshold: number,
): Promise<string[]> {
	const currentWindow = getFeaturedRankingCurrentWindowForHonoApi(windowRange);
	const previousWindow = currentWindow - 1;

	const redisPipeline = redis.pipeline();
	redisPipeline.zrange(`${name}:${currentWindow}`, 0, threshold, 'REV', 'WITHSCORES');
	redisPipeline.zrange(`${name}:${previousWindow}`, 0, threshold, 'REV', 'WITHSCORES');
	const [currentRankingResult, previousRankingResult] = await redisPipeline.exec()
		.then(result => result ? result.map(r => (r[1] ?? []) as string[]) : [[], []]);

	const ranking = new Map<string, number>();
	for (let i = 0; i < currentRankingResult!.length; i += 2) {
		const noteId = currentRankingResult![i]!;
		const score = parseInt(currentRankingResult![i + 1]!, 10);
		ranking.set(noteId, score);
	}
	for (let i = 0; i < previousRankingResult!.length; i += 2) {
		const noteId = previousRankingResult![i]!;
		const score = parseInt(previousRankingResult![i + 1]!, 10);
		const exist = ranking.get(noteId);
		if (exist != null) {
			ranking.set(noteId, (exist + score) / 2);
		} else {
			ranking.set(noteId, score);
		}
	}

	return Array.from(ranking.keys());
}

export function normalizeHonoApiUsersFeaturedNotesQuery(query: Record<string, string>): Record<string, unknown> {
	const body: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(query)) {
		if (key === 'limit') {
			const numeric = Number(value);
			body[key] = Number.isInteger(numeric) ? numeric : value;
		} else {
			body[key] = value;
		}
	}
	return body;
}

export const usersFeaturedNotesParamDef = z.object({
	limit: z.number().int().min(1).max(100).default(10),
	untilId: misskeyId().optional(),
	userId: misskeyId(),
});

type UsersFeaturedNotesParams = {
	limit: number;
	untilId?: string;
	userId: string;
};

export async function handleHonoApiUsersFeaturedNotes(
	deps: HonoApiNoteDependencies,
	me: MiUser | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(usersFeaturedNotesParamDef, body);

	const userIdsWhoBlockingMe = me ? new Set(await listBlockerIdsByBlockeeIdFromDatabase(deps.db, me.id)) : new Set<string>();

	if (userIdsWhoBlockingMe.has(params.userId)) {
		return [];
	}

	let noteIds = await getFeaturedRankingOfForHonoApi(deps.redis, `featuredPerUserNotesRanking:${params.userId}`, PER_USER_NOTES_RANKING_WINDOW, 50);

	noteIds.sort((a, b) => a > b ? -1 : 1);
	if (params.untilId) {
		noteIds = noteIds.filter(id => id < params.untilId!);
	}
	noteIds = noteIds.slice(0, params.limit);

	if (noteIds.length === 0) {
		return [];
	}

	const userIdsWhoMeMuting = me ? new Set(await listMuteeIdsByMuterIdFromDatabase(deps.db, me.id)) : new Set<string>();

	const notes = (await listFeaturedNotesByIdsFromDatabase(deps.db, noteIds, deps.meta.blockedHosts)).filter(note => {
		if (me && isUserRelated(note, userIdsWhoBlockingMe, false)) return false;
		if (me && isUserRelated(note, userIdsWhoMeMuting, true)) return false;

		return true;
	});

	notes.sort((a, b) => a.id > b.id ? -1 : 1);

	return await packNoteManyForHonoApi(deps, notes, me);
}

function notesTranslateUnavailableError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Translate of notes unavailable.',
		code: 'UNAVAILABLE',
		id: '50a70314-2d8a-431b-b433-efa5cc56444c',
	});
}

function notesTranslateNoSuchNoteError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such note.',
		code: 'NO_SUCH_NOTE',
		id: 'bea9b03f-36e0-49c5-a4db-627a029f8971',
	});
}

function notesTranslateCannotTranslateInvisibleNoteError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Cannot translate invisible note.',
		code: 'CANNOT_TRANSLATE_INVISIBLE_NOTE',
		id: 'ea29f2ca-c368-43b3-aaf1-5ac3e74bbe5d',
	});
}

export const notesTranslateParamDef = z.object({
	noteId: misskeyId(),
	targetLang: z.string(),
});

type NotesTranslateParams = {
	noteId: string;
	targetLang: string;
};

export type HonoApiNotesTranslateDependencies = HonoApiNoteDependencies & HonoApiRolePolicyDependencies & {
	httpRequestService: Pick<HttpRequestService, 'send'>;
};

const deeplTranslationResponse = z.object({
	translations: z.array(z.object({
		detected_source_language: z.string(),
		text: z.string(),
	})).min(1),
});

const libreTranslateResponse = z.object({
	translatedText: z.string(),
	detectedLanguage: z.object({
		language: z.string(),
	}).optional(),
});

export async function translateTextForHonoApi(
	deps: Pick<HonoApiNotesTranslateDependencies, 'meta' | 'httpRequestService'>,
	text: string,
	targetLang: string,
): Promise<{ sourceLang: string; text: string }> {
	if (deps.meta.translatorProvider === 'libreTranslate') {
		if (deps.meta.libreTranslateApiUrl == null) throw notesTranslateUnavailableError();

		const endpoint = new URL(deps.meta.libreTranslateApiUrl);
		endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/translate`;
		const body: Record<string, string> = {
			q: text,
			source: 'auto',
			target: targetLang.toLowerCase(),
			format: 'text',
		};
		if (deps.meta.libreTranslateApiKey != null) body.api_key = deps.meta.libreTranslateApiKey;

		const res = await deps.httpRequestService.send(endpoint.href, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json, */*',
			},
			body: JSON.stringify(body),
			timeout: 30_000,
			size: 1024 * 1024,
			isLocalAddressAllowed: true,
		});
		const json = libreTranslateResponse.parse(await res.json());

		return {
			sourceLang: json.detectedLanguage?.language ?? 'auto',
			text: json.translatedText,
		};
	}

	if (deps.meta.deeplAuthKey == null) throw notesTranslateUnavailableError();

	const searchParams = new URLSearchParams();
	searchParams.append('text', text);
	searchParams.append('target_lang', targetLang);
	const endpoint = deps.meta.deeplIsPro ? 'https://api.deepl.com/v2/translate' : 'https://api-free.deepl.com/v2/translate';
	const res = await deps.httpRequestService.send(endpoint, {
		method: 'POST',
		headers: {
			'Authorization': `DeepL-Auth-Key ${deps.meta.deeplAuthKey}`,
			'Content-Type': 'application/x-www-form-urlencoded',
			Accept: 'application/json, */*',
		},
		body: searchParams.toString(),
	});
	const json = deeplTranslationResponse.parse(await res.json());

	return {
		sourceLang: json.translations[0].detected_source_language,
		text: json.translations[0].text,
	};
}

export async function handleHonoApiNotesTranslate(
	deps: HonoApiNotesTranslateDependencies,
	me: MiUser,
	body: Record<string, unknown>,
): Promise<{ sourceLang: string; text: string } | undefined> {
	const params = parseHonoApiParams(notesTranslateParamDef, body);

	const policies = await getHonoApiRolePolicies(deps, me);
	if (!policies.canUseTranslator) {
		throw notesTranslateUnavailableError();
	}

	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) throw notesTranslateNoSuchNoteError();

	if (!(await isVisibleForMeForHonoApi(deps, note, me.id))) {
		throw notesTranslateCannotTranslateInvisibleNoteError();
	}

	if (note.text == null) {
		return undefined;
	}

	let targetLang = params.targetLang;
	if (targetLang.includes('-')) targetLang = targetLang.split('-')[0]!;

	return await translateTextForHonoApi(deps, note.text, targetLang);
}

export const usersNotesParamDef = z.object({
	userId: misskeyId(),
	withReplies: z.boolean().default(false),
	withRenotes: z.boolean().default(true),
	withChannelNotes: z.boolean().default(false),
	limit: z.number().int().min(1).max(100).default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
	allowPartial: z.boolean().default(false),
	withFiles: z.boolean().default(false),
});

type UsersNotesParams = {
	userId: string;
	withReplies: boolean;
	withRenotes: boolean;
	withChannelNotes: boolean;
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
	allowPartial: boolean;
	withFiles: boolean;
};

function usersNotesBothWithRepliesAndWithFilesError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Specifying both withReplies and withFiles is not supported',
		code: 'BOTH_WITH_REPLIES_AND_WITH_FILES',
		id: '91c8cb9f-36ed-46e7-9ca2-7df96ed6e222',
	});
}

export async function handleHonoApiUsersNotes(
	deps: HonoApiNoteDependencies,
	me: MiUser | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(usersNotesParamDef, body);

	if (params.withReplies && params.withFiles) throw usersNotesBothWithRepliesAndWithFilesError();

	const untilId = params.untilId ?? (params.untilDate ? genId(params.untilDate) : null);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(params.sinceDate) : null);

	if (me != null) {
		const userIdsWhoBlockingMe = await listBlockerIdsByBlockeeIdFromDatabase(deps.db, me.id);
		if (userIdsWhoBlockingMe.includes(params.userId)) return [];
	}

	const getFromDb = async (dbUntilId: string | null, dbSinceId: string | null, limit: number) => {
		const mutingChannelIds = me != null
			? await listActiveMutedChannelIdsByUserIdFromDatabase(deps.db, me.id, new Date())
			: [];

		return await listUserTimelineNotesFromDatabase(deps.db, {
			userId: params.userId,
			limit,
			sinceId: dbSinceId,
			untilId: dbUntilId,
			withChannelNotes: params.withChannelNotes,
			withFiles: params.withFiles,
			withRenotes: params.withRenotes,
			me: me ?? null,
			blockedHosts: deps.meta.blockedHosts,
			mutingChannelIds,
		});
	};

	if (deps.meta.enableFanoutTimeline && deps.redisForTimelines != null) {
		const isSelf = me != null && me.id === params.userId;

		const redisTimelines = [params.withFiles ? `userTimelineWithFiles:${params.userId}` : `userTimeline:${params.userId}`];
		if (params.withReplies) redisTimelines.push(`userTimelineWithReplies:${params.userId}`);
		if (params.withChannelNotes) redisTimelines.push(`userTimelineWithChannel:${params.userId}`);

		const isFollowing = me != null && await followingExistsInDatabase(deps.db, me.id, params.userId);

		const notes = await getFanoutTimelineNotesForHonoApi({ db: deps.db, meta: deps.meta, redisForTimelines: deps.redisForTimelines }, {
			untilId,
			sinceId,
			limit: params.limit,
			allowPartial: params.allowPartial,
			me,
			useDbFallback: true,
			redisTimelines,
			ignoreAuthorFromMute: true,
			ignoreAuthorFromInstanceBlock: true,
			ignoreAuthorFromUserSuspension: true,
			excludeReplies: params.withChannelNotes && !params.withReplies,
			excludeNoFiles: params.withChannelNotes && params.withFiles,
			excludePureRenotes: !params.withRenotes,
			noteFilter: note => {
				if (note.channel?.isSensitive && !isSelf) return false;
				if (note.visibility === 'specified' && (!me || (me.id !== note.userId && !note.visibleUserIds.some(v => v === me.id)))) return false;
				if (note.visibility === 'followers' && !isFollowing && !isSelf) return false;

				return true;
			},
			dbFallback: getFromDb,
		});

		return await packNoteManyForHonoApi(deps, notes, me);
	}

	const notes = await getFromDb(untilId, sinceId, params.limit);

	return await packNoteManyForHonoApi(deps, notes, me);
}
