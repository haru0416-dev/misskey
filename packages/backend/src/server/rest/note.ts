/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII, URLSearchParams } from 'node:url';
import type * as Redis from 'ioredis';
import { z } from 'zod';
import { fetchChannelByIdFromDatabase, listChannelsByIdsFromDatabase } from '@/core/ChannelStore.js';
import { fetchActiveMutedChannelIdsFromDatabase } from '@/core/ChannelMutingStore.js';
import { fetchEmojiByNameAndHostFromDatabaseCached } from '@/core/EmojiStore.js';
import { followingExistsInDatabase } from '@/core/FollowingStore.js';
import { fetchNoteByIdFromDatabase, fetchNoteByIdOrFailFromDatabase, listFeaturedNotesByIdsFromDatabase, listUserTimelineNotesFromDatabase } from '@/core/NoteStore.js';
import { fetchNoteReactionByUserAndNoteFromDatabase, listNoteReactionsByUserAndNoteIdsFromDatabase } from '@/core/NoteReactionStore.js';
import { fetchPollByNoteIdOrFailFromDatabase } from '@/core/PollStore.js';
import { fetchPollVoteByNoteAndUserFromDatabase, listPollVotesByNoteAndUserFromDatabase } from '@/core/PollVoteStore.js';
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

async function populateEmoji(
	deps: HonoApiEmojiPopulateDependencies,
	emojiName: string,
	noteUserHost: string | null,
): Promise<string | null> {
	const { name, host } = parseEmojiStr(deps.config, emojiName, noteUserHost);
	if (name == null || host == null) return null;

	const emoji = await fetchEmojiByNameAndHostFromDatabaseCached(deps.db, name, host);
	if (emoji == null) return null;

	return emoji.publicUrl || emoji.originalUrl;
}

export async function populateEmojis(
	deps: HonoApiEmojiPopulateDependencies,
	emojiNames: string[],
	noteUserHost: string | null,
): Promise<Record<string, string>> {
	const resolved = await Promise.all(emojiNames.map(name => populateEmoji(deps, name, noteUserHost)));
	const res: Record<string, string> = {};
	for (let i = 0; i < emojiNames.length; i++) {
		const url = resolved[i];
		if (url != null) res[emojiNames[i]!] = url;
	}
	return res;
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
): Promise<{ multiple: boolean; expiresAt: string | null; choices: { text: string; votes: number; isVoted: boolean }[] }> {
	const poll = await fetchPollByNoteIdOrFailFromDatabase(deps.db, note.id);
	const choices = poll.choices.map(c => ({
		text: c,
		votes: poll.votes[poll.choices.indexOf(c)]!,
		isVoted: false,
	}));

	if (meId) {
		if (poll.multiple) {
			const votes = await listPollVotesByNoteAndUserFromDatabase(deps.db, note.id, meId);
			for (const vote of votes) {
				choices[vote.choice]!.isVoted = true;
			}
		} else {
			const vote = await fetchPollVoteByNoteAndUserFromDatabase(deps.db, note.id, meId);
			if (vote) choices[vote.choice]!.isVoted = true;
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

		// home/hybrid タイムライン等、呼び出し元が既に me の全フォロー先を取得済みの場合は
		// followeeIds を hint として渡すことで pack 対象ノート毎の followingExists クエリを避ける。
		const isFollowing = followeeIds ? followeeIds.has(packedNote.userId) : await followingExistsInDatabase(deps.db, meId, packedNote.userId);
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
type PackNoteBatchHint = {
	noteIds: Set<MiNote['id']>;
	bufferedReactions: Map<MiNote['id'], { deltas: Record<string, number>; pairs: [MiUser['id'], string][] }>;
	myReactions: Map<MiNote['id'], string | undefined>;
	packedUsers: Map<MiUser['id'], Packed<'UserLite'>>;
	packedFiles: Map<string, Packed<'DriveFile'>>;
	channels: Map<string, PackNoteChannel>;
	/**
	 * me の全フォロー先ID集合。noteIds による対象ノート制限とは独立 (誰をフォローしているかは
	 * どのノートを pack しているかに関わらず有効なので、hint内の他フィールドと違い無条件で使える)。
	 */
	followeeIds?: Set<MiUser['id']>;
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

	const reactionEmojiNames = Object.keys(reactions)
		.filter(x => x.startsWith(':') && x.includes('@') && !x.includes('@.'))
		.map(x => decodeReaction(x).reaction.replaceAll(':', ''));

	const [user, files, reactionEmojis, emojis, channel, reply, renote, poll, myReaction] = await Promise.all([
		hint?.packedUsers.get(note.userId) ?? packUserLiteForHonoApi(deps, note.user ?? note.userId),
		hint != null
			? note.fileIds.map(id => hint.packedFiles.get(id)).filter((f): f is Packed<'DriveFile'> => f != null)
			: packDriveFileManyByIdsForHonoApi(deps, note.fileIds),
		populateEmojis(deps, reactionEmojiNames, host),
		host != null ? populateEmojis(deps, note.emojis, host) : Promise.resolve(undefined),
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
		(opts.detail && note.hasPoll) ? populatePoll(deps, note, meId) : Promise.resolve(undefined),
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

	if (!opts.skipHide && await shouldHideNoteForHonoApi(deps, packed, meId, opts.hint?.followeeIds)) {
		hideNoteForHonoApi(packed);
	}

	return packed;
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

	// 本体 + relation ロード済みの reply/renote を事前一括取得の対象にする
	// (relation 未ロードのノートは packNoteForHonoApi 内の個別取得にフォールバックする)
	const targetById = new Map<MiNote['id'], MiNote>();
	const myReactionTargetIds = new Set<MiNote['id']>();
	for (const note of notes) {
		targetById.set(note.id, note);
		myReactionTargetIds.add(note.id);
		if (detail) {
			if (note.reply) targetById.set(note.reply.id, note.reply);
			if (note.renote) {
				targetById.set(note.renote.id, note.renote);
				// renote は detail:true で pack されるので myReaction も必要 (reply は detail:false なので不要)
				myReactionTargetIds.add(note.renote.id);
			}
		}
	}
	const targets = [...targetById.values()];

	const bufferedReactions = await getBufferedReactionsMany(deps, targets.map(t => t.id));

	// myReaction: populateMyReactionForHonoApi と同じ判定で pair cache から解決し、
	// DB 参照が必要なノートだけ IN 句 1 クエリでまとめて引く
	const myReactions = new Map<MiNote['id'], string | undefined>();
	if (meId != null && detail) {
		const idsNeedingDbLookup: MiNote['id'][] = [];
		for (const target of targets) {
			if (!myReactionTargetIds.has(target.id)) continue;
			const buffered = bufferedReactions.get(target.id)!;
			const reactions = normalizeReactionKeys(mergeReactions(target.reactions, buffered.deltas));
			const reactionsCount = Object.values(reactions).reduce((a, b) => a + b, 0);
			if (reactionsCount === 0) {
				myReactions.set(target.id, undefined);
				continue;
			}
			const pairCache = (target.reactionAndUserPairCache ?? []).concat(buffered.pairs.map(x => x.join('/')));
			if (reactionsCount <= pairCache.length) {
				const pair = pairCache.find(p => p.startsWith(meId));
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

	const userSrcById = new Map<MiUser['id'], MiUser['id'] | MiUser>();
	const fileIds = new Set<string>();
	const channelIds = new Set<string>();
	for (const target of targets) {
		const existing = userSrcById.get(target.userId);
		if (existing == null || typeof existing === 'string') {
			userSrcById.set(target.userId, target.user ?? target.userId);
		}
		for (const fileId of target.fileIds) fileIds.add(fileId);
		if (target.channelId) channelIds.add(target.channelId);
	}

	const [packedUserArray, packedFileArray, channelArray] = await Promise.all([
		packUserLiteManyForHonoApi(deps, [...userSrcById.values()]),
		packDriveFileManyByIdsForHonoApi(deps, [...fileIds]),
		channelIds.size > 0 ? listChannelsByIdsFromDatabase(deps.db, [...channelIds]) : Promise.resolve([]),
	]);

	const hint: PackNoteBatchHint = {
		noteIds: new Set(targetById.keys()),
		bufferedReactions,
		myReactions,
		packedUsers: new Map(packedUserArray.map(u => [u.id, u])),
		packedFiles: new Map(packedFileArray.map(f => [f.id, f])),
		channels: new Map(channelArray.map(c => [c.id, c])),
		followeeIds: options?.followeeIds,
	};

	return await Promise.all(notes.map(n => packNoteForHonoApi(deps, n, me, { ...options, hint })));
}

export async function fetchNoteDiffsForHonoApi(
	deps: HonoApiNoteDependencies,
	notes: MiNote[],
): Promise<{ id: string; reactions: MiNote['reactions']; reactionEmojis: Record<string, string> }[]> {
	return await Promise.all(notes.map(async note => {
		const bufferedReactions = await getBufferedReactions(deps, note.id);
		const reactions = normalizeReactionKeys(mergeReactions(note.reactions, bufferedReactions.deltas));

		const reactionEmojiNames = Object.keys(reactions)
			.filter(x => x.startsWith(':') && x.includes('@') && !x.includes('@.'))
			.map(x => decodeReaction(x).reaction.replaceAll(':', ''));
		const reactionEmojis = await populateEmojis(deps, reactionEmojiNames, note.userHost);

		return { id: note.id, reactions, reactionEmojis };
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

	if (deps.meta.deeplAuthKey == null) {
		throw notesTranslateUnavailableError();
	}

	let targetLang = params.targetLang;
	if (targetLang.includes('-')) targetLang = targetLang.split('-')[0]!;

	const searchParams = new URLSearchParams();
	searchParams.append('text', note.text);
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

	const json = (await res.json()) as {
		translations: {
			detected_source_language: string;
			text: string;
		}[];
	};

	return {
		sourceLang: json.translations[0]!.detected_source_language,
		text: json.translations[0]!.text,
	};
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
			? await fetchActiveMutedChannelIdsFromDatabase(deps.db, me.id, new Date())
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
