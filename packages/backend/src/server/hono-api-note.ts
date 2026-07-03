/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII, URLSearchParams } from 'node:url';
import type * as Redis from 'ioredis';
import { fetchChannelByIdFromDatabase } from '@/core/ChannelStore.js';
import { fetchEmojiByNameAndHostFromDatabase } from '@/core/EmojiStore.js';
import { followingExistsInDatabase } from '@/core/FollowingStore.js';
import { fetchNoteByIdFromDatabase, fetchNoteByIdOrFailFromDatabase, listFeaturedNotesByIdsFromDatabase } from '@/core/NoteStore.js';
import { fetchNoteReactionByUserAndNoteFromDatabase } from '@/core/NoteReactionStore.js';
import { fetchPollByNoteIdOrFailFromDatabase } from '@/core/PollStore.js';
import { fetchPollVoteByNoteAndUserFromDatabase, listPollVotesByNoteAndUserFromDatabase } from '@/core/PollVoteStore.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import { listBlockerIdsByBlockeeIdFromDatabase } from '@/core/BlockingStore.js';
import { listMuteeIdsByMuterIdFromDatabase } from '@/core/MutingStore.js';
import type { Config } from '@/config.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import { isEntityNotFoundError } from '@/misc/db-errors.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { shouldHideNoteByTime } from '@/misc/should-hide-note-by-time.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { packDriveFileManyByIdsForHonoApi, type HonoApiDriveFileDependencies } from './hono-api-drive-file.js';
import { HonoApiError } from './hono-api-error.js';
import { getHonoApiRolePolicies, type HonoApiRolePolicyDependencies } from './hono-api-role-policy.js';
import { packUserLiteForHonoApi, type UserPackingDependencies } from './hono-api-user.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiNoteDependencies = HonoApiDriveFileDependencies & UserPackingDependencies & {
	redis: Redis.Redis;
};

export type HonoApiEmojiPopulateDependencies = {
	config: Config;
	db: HonoApiNoteDependencies['db'];
};

const REACTIONS_BUFFER_DELTA_PREFIX = 'reactionsBufferDeltas';
const REACTIONS_BUFFER_PAIR_PREFIX = 'reactionsBufferPairs';

const legacyReactions: Record<string, string> = {
	'like': '👍',
	'love': '❤',
	'laugh': '😆',
	'hmm': '🤔',
	'surprise': '😮',
	'congrats': '🎉',
	'angry': '💢',
	'confused': '😥',
	'rip': '😇',
	'pudding': '🍮',
	'star': '⭐',
};

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

function convertLegacyReaction(reaction: string): string {
	reaction = decodeReaction(reaction).reaction;
	if (Object.hasOwn(legacyReactions, reaction)) return legacyReactions[reaction]!;
	return reaction;
}

function convertLegacyReactions(reactions: MiNote['reactions']): MiNote['reactions'] {
	return Object.entries(reactions)
		.filter(([, count]) => count > 0)
		.map(([reaction, count]) => [convertLegacyReaction(reaction), count] as const)
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

	const emoji = await fetchEmojiByNameAndHostFromDatabase(deps.db, name, host);
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

async function populateMyReaction(
	deps: HonoApiNoteDependencies,
	note: { id: MiNote['id']; reactions: MiNote['reactions']; reactionAndUserPairCache: MiNote['reactionAndUserPairCache'] },
	meId: MiUser['id'],
): Promise<string | undefined> {
	const reactionsCount = Object.values(note.reactions).reduce((a, b) => a + b, 0);
	if (reactionsCount === 0) return undefined;

	if (note.reactionAndUserPairCache && reactionsCount <= note.reactionAndUserPairCache.length) {
		const pair = note.reactionAndUserPairCache.find(p => p.startsWith(meId));
		if (pair) return convertLegacyReaction(pair.split('/')[1]!);
		return undefined;
	}

	if (parseId(deps.config, note.id).date.getTime() + 2000 > Date.now()) return undefined;

	const reaction = await fetchNoteReactionByUserAndNoteFromDatabase(deps.db, meId, note.id);
	if (reaction) return convertLegacyReaction(reaction.reaction);

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

async function shouldHideNote(
	deps: HonoApiNoteDependencies,
	packedNote: Packed<'Note'>,
	meId: MiUser['id'] | null,
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

		const isFollowing = await followingExistsInDatabase(deps.db, meId, packedNote.userId);
		if (!isFollowing) return true;
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

export async function packNoteForHonoApi(
	deps: HonoApiNoteDependencies,
	src: MiNote['id'] | MiNote,
	me: { id: MiUser['id'] } | null | undefined,
	options?: {
		detail?: boolean;
		skipHide?: boolean;
		withReactionAndUserPairCache?: boolean;
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

	const bufferedReactions = await getBufferedReactions(deps, note.id);
	const reactions = convertLegacyReactions(mergeReactions(note.reactions, bufferedReactions.deltas));
	const reactionAndUserPairCache = note.reactionAndUserPairCache.concat(bufferedReactions.pairs.map(x => x.join('/')));

	let text = note.text;
	if (note.name && (note.url ?? note.uri)) {
		text = `【${note.name}】\n${(note.text ?? '').trim()}\n\n${note.url ?? note.uri}`;
	}

	const reactionEmojiNames = Object.keys(reactions)
		.filter(x => x.startsWith(':') && x.includes('@') && !x.includes('@.'))
		.map(x => decodeReaction(x).reaction.replaceAll(':', ''));

	const [user, files, reactionEmojis, emojis, channel, reply, renote, poll, myReaction] = await Promise.all([
		packUserLiteForHonoApi(deps, note.user ?? note.userId),
		packDriveFileManyByIdsForHonoApi(deps, note.fileIds),
		populateEmojis(deps, reactionEmojiNames, host),
		host != null ? populateEmojis(deps, note.emojis, host) : Promise.resolve(undefined),
		note.channelId ? fetchChannelByIdFromDatabase(deps.db, note.channelId) : Promise.resolve(null),
		(opts.detail && note.replyId) ? nullIfEntityNotFound(packNoteForHonoApi(deps, note.replyId, me, {
			detail: false,
			skipHide: opts.skipHide,
			withReactionAndUserPairCache: opts.withReactionAndUserPairCache,
		})) : Promise.resolve(undefined),
		(opts.detail && note.renoteId) ? nullIfEntityNotFound(packNoteForHonoApi(deps, note.renoteId, me, {
			detail: true,
			skipHide: opts.skipHide,
			withReactionAndUserPairCache: opts.withReactionAndUserPairCache,
		})) : Promise.resolve(undefined),
		(opts.detail && note.hasPoll) ? populatePoll(deps, note, meId) : Promise.resolve(undefined),
		(opts.detail && meId && Object.keys(reactions).length > 0) ? populateMyReaction(deps, {
			id: note.id,
			reactions,
			reactionAndUserPairCache,
		}, meId) : Promise.resolve(undefined),
	]);

	const packed = {
		id: note.id,
		createdAt: parseId(deps.config, note.id).date.toISOString(),
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

	if (!opts.skipHide && await shouldHideNote(deps, packed, meId)) {
		hideNote(packed);
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
	},
): Promise<Packed<'Note'>[]> {
	if (notes.length === 0) return [];

	return await Promise.all(notes.map(n => packNoteForHonoApi(deps, n, me, options)));
}

export async function fetchNoteDiffsForHonoApi(
	deps: HonoApiNoteDependencies,
	notes: MiNote[],
): Promise<{ id: string; reactions: MiNote['reactions']; reactionEmojis: Record<string, string> }[]> {
	return await Promise.all(notes.map(async note => {
		const bufferedReactions = await getBufferedReactions(deps, note.id);
		const reactions = convertLegacyReactions(mergeReactions(note.reactions, bufferedReactions.deltas));

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

const usersFeaturedNotesParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		untilId: { type: 'string', format: 'misskey:id' },
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId'],
} as const;

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
	const params = parseHonoApiParams(usersFeaturedNotesParamDef, body) as UsersFeaturedNotesParams;

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

const notesTranslateParamDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
		targetLang: { type: 'string' },
	},
	required: ['noteId', 'targetLang'],
} as const;

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
	const params = parseHonoApiParams(notesTranslateParamDef, body) as NotesTranslateParams;

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
