/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';
import { listBlockerIdsByBlockeeIdFromDatabase } from '@/core/BlockingStore.js';
import { listActiveMutedChannelIdsByUserIdFromDatabase } from '@/core/ChannelMutingStore.js';
import { listMuteeIdsByMuterIdFromDatabase } from '@/core/MutingStore.js';
import { listHydratedNotesByIdsFromDatabase } from '@/core/NoteStore.js';
import { listRenoteMuteeIdsByMuterIdFromDatabase } from '@/core/RenoteMutingStore.js';
import { fetchUserProfileByUserIdFromDatabase } from '@/core/UserProfileStore.js';
import { isChannelRelated } from '@/misc/is-channel-related.js';
import { isInstanceMuted } from '@/misc/is-instance-muted.js';
import { isQuote, isRenote } from '@/misc/is-renote.js';
import { isReply } from '@/misc/is-reply.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/_.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';

export type FanoutTimelineReadDependencies = {
	db: MiDrizzleDatabase;
	meta: MiMeta;
	redisForTimelines: Redis.Redis;
};

type NoteFilter = (note: MiNote) => boolean;

export type FanoutTimelineReadOptions = {
	untilId: string | null;
	sinceId: string | null;
	limit: number;
	allowPartial: boolean;
	me?: { id: MiUser['id'] } | undefined | null;
	useDbFallback: boolean;
	redisTimelines: string[];
	noteFilter?: NoteFilter;
	alwaysIncludeMyNotes?: boolean;
	ignoreAuthorFromBlock?: boolean;
	ignoreAuthorFromMute?: boolean;
	ignoreAuthorFromInstanceBlock?: boolean;
	ignoreAuthorChannelFromMute?: boolean;
	excludeNoFiles?: boolean;
	excludeReplies?: boolean;
	excludePureRenotes: boolean;
	ignoreAuthorFromUserSuspension?: boolean;
	dbFallback: (untilId: string | null, sinceId: string | null, limit: number) => Promise<MiNote[]>;
};

function isBlockedHost(blockedHosts: string[], host: string | null): boolean {
	if (host == null) return false;
	return blockedHosts.some(x => `.${host.toLowerCase()}`.endsWith(`.${x}`));
}

async function getMultiFromRedis(redisForTimelines: Redis.Redis, names: string[], untilId?: string | null, sinceId?: string | null): Promise<string[][]> {
	const pipeline = redisForTimelines.pipeline();
	for (const name of names) {
		pipeline.lrange('list:' + name, 0, -1);
	}
	const res = await pipeline.exec();
	if (res == null) return [];
	const tls = res.map(r => r[1] as string[]);
	return tls.map(ids =>
		(untilId && sinceId)
			? ids.filter(id => id < untilId && id > sinceId).sort((a, b) => a > b ? -1 : 1)
			: untilId
				? ids.filter(id => id < untilId).sort((a, b) => a > b ? -1 : 1)
				: sinceId
					? ids.filter(id => id > sinceId).sort((a, b) => a < b ? -1 : 1)
					: ids.sort((a, b) => a > b ? -1 : 1),
	);
}

/**
 * FanoutTimelineEndpointService.getMiNotes 相当。Redis の fanout タイムラインから note ID 群を読み、
 * DBでhydrateしつつ各種フィルタ (ミュート/ブロック/インスタンスミュート/チャンネルミュート/ブロック済み
 * ホスト/凍結ユーザー) を適用する。原典が RedisKVCache 経由で読んでいたミュート等の関連セットは
 * 直接DB読みに置き換えている (このコードベースの確立パターン)。
 */
export async function getFanoutTimelineNotesForHonoApi(deps: FanoutTimelineReadDependencies, ps: FanoutTimelineReadOptions): Promise<MiNote[]> {
	const dbFallback = ps.useDbFallback ? ps.dbFallback : () => Promise.resolve([]);

	const ascending = ps.sinceId && !ps.untilId;
	const idCompare: (a: string, b: string) => number = ascending ? (a, b) => a < b ? -1 : 1 : (a, b) => a > b ? -1 : 1;

	const redisResult = await getMultiFromRedis(deps.redisForTimelines, ps.redisTimelines, ps.untilId, ps.sinceId);

	const redisResultIds = Array.from(new Set(redisResult.flat(1))).sort(idCompare);

	let noteIds = redisResultIds.slice(0, ps.limit);
	const oldestNoteId = ascending ? redisResultIds[0] : redisResultIds[redisResultIds.length - 1];
	const shouldFallbackToDb = noteIds.length === 0 || (ps.sinceId != null && oldestNoteId != null && ps.sinceId < oldestNoteId);

	if (!shouldFallbackToDb) {
		let filter = ps.noteFilter ?? ((_note: MiNote) => true);

		if (ps.alwaysIncludeMyNotes && ps.me) {
			const me = ps.me;
			const parentFilter = filter;
			filter = (note) => note.userId === me.id || parentFilter(note);
		}

		if (ps.excludeNoFiles) {
			const parentFilter = filter;
			filter = (note) => note.fileIds.length !== 0 && parentFilter(note);
		}

		if (ps.excludeReplies) {
			const parentFilter = filter;
			filter = (note) => !isReply(note, ps.me?.id) && parentFilter(note);
		}

		if (ps.excludePureRenotes) {
			const parentFilter = filter;
			filter = (note) => (!isRenote(note) || isQuote(note)) && parentFilter(note);
		}

		if (ps.me) {
			const me = ps.me;
			const [
				userIdsWhoMeMuting,
				userIdsWhoMeMutingRenotes,
				userIdsWhoBlockingMe,
				userMutedInstances,
				userMutedChannels,
			] = await Promise.all([
				listMuteeIdsByMuterIdFromDatabase(deps.db, me.id).then(ids => new Set(ids)),
				listRenoteMuteeIdsByMuterIdFromDatabase(deps.db, me.id).then(ids => new Set(ids)),
				listBlockerIdsByBlockeeIdFromDatabase(deps.db, me.id).then(ids => new Set(ids)),
				fetchUserProfileByUserIdFromDatabase(deps.db, me.id).then(p => new Set(p?.mutedInstances ?? [])),
				listActiveMutedChannelIdsByUserIdFromDatabase(deps.db, me.id, new Date()).then(ids => new Set(ids)),
			]);

			const parentFilter = filter;
			filter = (note) => {
				if (isUserRelated(note, userIdsWhoBlockingMe, ps.ignoreAuthorFromBlock)) return false;
				if (isUserRelated(note, userIdsWhoMeMuting, ps.ignoreAuthorFromMute)) return false;
				if (isUserRelated(note.renote, userIdsWhoBlockingMe, ps.ignoreAuthorFromBlock)) return false;
				if (isUserRelated(note.renote, userIdsWhoMeMuting, ps.ignoreAuthorFromMute)) return false;
				if (!ps.ignoreAuthorFromMute && isRenote(note) && !isQuote(note) && userIdsWhoMeMutingRenotes.has(note.userId)) return false;
				if (isInstanceMuted(note, userMutedInstances)) return false;
				if (isChannelRelated(note, userMutedChannels, ps.ignoreAuthorChannelFromMute)) return false;

				return parentFilter(note);
			};
		}

		{
			const parentFilter = filter;
			filter = (note) => {
				if (!ps.ignoreAuthorFromInstanceBlock) {
					if (isBlockedHost(deps.meta.blockedHosts, note.userHost)) return false;
				}
				if (note.userId !== note.renoteUserId && isBlockedHost(deps.meta.blockedHosts, note.renoteUserHost)) return false;
				if (note.userId !== note.replyUserId && isBlockedHost(deps.meta.blockedHosts, note.replyUserHost)) return false;

				return parentFilter(note);
			};
		}

		{
			const parentFilter = filter;
			filter = (note) => {
				if (!ps.ignoreAuthorFromUserSuspension) {
					if (note.user!.isSuspended) return false;
				}
				if (note.userId !== note.renoteUserId && note.renote?.user?.isSuspended) return false;
				if (note.userId !== note.replyUserId && note.reply?.user?.isSuspended) return false;

				return parentFilter(note);
			};
		}

		const redisTimeline: MiNote[] = [];
		let readFromRedis = 0;
		let lastSuccessfulRate = 1;

		while ((redisResultIds.length - readFromRedis) !== 0) {
			const remainingToRead = ps.limit - redisTimeline.length;

			const countToGet = Math.ceil(remainingToRead * Math.min(1.1 / lastSuccessfulRate, 3));
			noteIds = redisResultIds.slice(readFromRedis, readFromRedis + countToGet);

			readFromRedis += noteIds.length;

			const notes = (await listHydratedNotesByIdsFromDatabase(deps.db, noteIds)).filter(filter);
			notes.sort((a, b) => idCompare(a.id, b.id));
			redisTimeline.push(...notes);
			lastSuccessfulRate = notes.length / noteIds.length;

			if (ps.allowPartial ? redisTimeline.length !== 0 : redisTimeline.length >= ps.limit) {
				return redisTimeline.slice(0, ps.limit);
			}
		}

		const remainingToRead = ps.limit - redisTimeline.length;
		let dbUntil: string | null;
		let dbSince: string | null;
		if (ascending) {
			dbUntil = ps.untilId;
			dbSince = noteIds[noteIds.length - 1] ?? null;
		} else {
			dbUntil = noteIds[noteIds.length - 1] ?? null;
			dbSince = ps.sinceId;
		}
		const gotFromDb = await dbFallback(dbUntil, dbSince, remainingToRead);
		return [...redisTimeline, ...gotFromDb];
	}

	return await dbFallback(ps.untilId, ps.sinceId, ps.limit);
}
