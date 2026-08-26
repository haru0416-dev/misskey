/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';
import { listChannelsByIdsFromDatabase } from '@/core/channel/ChannelStore.js';
import { listNotesByIdsFromDatabase } from '@/core/note/NoteStore.js';
import { listUsersByIdsFromDatabase } from '@/core/user/UserStore.js';
import {
	fanoutViewerRelationKinds,
	fetchViewerRelationSnapshotFromDatabase,
	viewerRelationSnapshotCovers,
} from '@/core/user/ViewerRelationStore.js';
import { isChannelRelated } from '@/misc/is-channel-related.js';
import { isInstanceMuted } from '@/misc/is-instance-muted.js';
import { isQuote, isRenote } from '@/misc/is-renote.js';
import { isReply } from '@/misc/is-reply.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/_.js';
import type { MiChannel } from '@/models/Channel.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import type { ViewerRelationSnapshot } from '@/core/user/ViewerRelationStore.js';

export type FanoutTimelineReadDependencies = {
	db: MiDrizzleDatabase;
	meta: MiMeta;
	redisForTimelines: Redis.Redis;
};

type NoteFilter = (note: MiNote) => boolean;

async function listFanoutTimelineNotesByIds(
	db: MiDrizzleDatabase,
	noteIds: MiNote['id'][],
	hydrateChannels: boolean,
): Promise<MiNote[]> {
	const notes = await listNotesByIdsFromDatabase(db, noteIds);
	const relationIds = new Set<MiNote['id']>();
	const userIds = new Set<MiUser['id']>();
	const channelIds = new Set<MiChannel['id']>();
	for (const note of notes) {
		userIds.add(note.userId);
		if (note.replyId != null) relationIds.add(note.replyId);
		if (note.renoteId != null) relationIds.add(note.renoteId);
		if (note.replyUserId != null) userIds.add(note.replyUserId);
		if (note.renoteUserId != null) userIds.add(note.renoteUserId);
		if (hydrateChannels) {
			// renoteChannelId は note 作成時に renote 先の channelId を非正規化したもの。
			// リノート経由でチャンネルの素性を判定する側は relations を待たずにここで引ける
			if (note.channelId != null) channelIds.add(note.channelId);
			if (note.renoteChannelId != null) channelIds.add(note.renoteChannelId);
		}
	}

	const [relations, users, channels] = await Promise.all([
		listNotesByIdsFromDatabase(db, [...relationIds]),
		listUsersByIdsFromDatabase(db, [...userIds], { includeSuspended: true }),
		// 空配列なら listChannelsByIdsFromDatabase 側で早期 return されるので、
		// note.channel を読まない呼び出し元にクエリ1本を課金せずに済む
		listChannelsByIdsFromDatabase(db, [...channelIds]),
	]);
	const relationById = new Map(relations.map((note) => [note.id, note]));
	const userById = new Map(users.map((user) => [user.id, user]));
	const channelById = new Map(channels.map((channel) => [channel.id, channel]));

	return notes.flatMap((note) => {
		const user = userById.get(note.userId);
		if (user == null) return [];

		note.user = user;
		if (hydrateChannels) note.channel = note.channelId == null ? null : (channelById.get(note.channelId) ?? null);
		note.reply = note.replyId == null ? null : (relationById.get(note.replyId) ?? null);
		note.renote = note.renoteId == null ? null : (relationById.get(note.renoteId) ?? null);
		if (note.reply != null) note.reply.user = userById.get(note.reply.userId) ?? null;
		if (note.renote != null) {
			note.renote.user = userById.get(note.renote.userId) ?? null;
			if (hydrateChannels)
				note.renote.channel = note.renote.channelId == null ? null : (channelById.get(note.renote.channelId) ?? null);
		}
		return [note];
	});
}

export type FanoutTimelineReadOptions = {
	untilId: string | null;
	sinceId: string | null;
	limit: number;
	allowPartial: boolean;
	me?: { id: MiUser['id'] } | undefined | null;
	/**
	 * 呼び出し元が既に閲覧者コンテキストを取っているなら渡す。無ければここで1本引く。
	 * タイムライン系のハンドラは followee 一覧などを先に読んでいるので、渡さないと同じ行を2度引くことになる。
	 */
	viewerRelation?: ViewerRelationSnapshot | undefined;
	useDbFallback: boolean;
	redisTimelines: string[];
	noteFilter?: NoteFilter;
	/**
	 * noteFilter が `note.channel` / `note.renote.channel` を読むなら必ず true にすること。
	 * false のままだと両方 undefined のままなので、チャンネル起因の除外が黙って素通りする。
	 * 逆に読まない呼び出し元で true にすると、捨てるだけのチャンネル取得が1本増える
	 * (`note.channelId` / `note.renoteChannelId` を見るだけの判定にはhydrate不要)。
	 */
	hydrateChannels?: boolean;
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
	return blockedHosts.some((x) => `.${host.toLowerCase()}`.endsWith(`.${x}`));
}

async function getMultiFromRedis(
	redisForTimelines: Redis.Redis,
	names: string[],
	untilId?: string | null,
	sinceId?: string | null,
): Promise<string[][]> {
	const pipeline = redisForTimelines.pipeline();
	for (const name of names) {
		pipeline.lrange('list:' + name, 0, -1);
	}
	const res = await pipeline.exec();
	if (res == null) return [];
	const tls = res.map((r) => r[1] as string[]);
	return tls.map((ids) =>
		untilId && sinceId
			? ids.filter((id) => id < untilId && id > sinceId)
			: untilId
				? ids.filter((id) => id < untilId)
				: sinceId
					? ids.filter((id) => id > sinceId)
					: ids,
	);
}

export async function getFanoutTimelineNotesForHonoApi(
	deps: FanoutTimelineReadDependencies,
	ps: FanoutTimelineReadOptions,
): Promise<MiNote[]> {
	const dbFallback = ps.useDbFallback ? ps.dbFallback : () => Promise.resolve([]);

	const ascending = ps.sinceId && !ps.untilId;
	const idCompare: (a: string, b: string) => number = ascending
		? (a, b) => (a < b ? -1 : 1)
		: (a, b) => (a > b ? -1 : 1);

	const redisResult = await getMultiFromRedis(deps.redisForTimelines, ps.redisTimelines, ps.untilId, ps.sinceId);

	const redisResultIds = Array.from(new Set(redisResult.flat(1))).sort(idCompare);

	let noteIds = redisResultIds.slice(0, ps.limit);
	const oldestNoteId = ascending ? redisResultIds[0] : redisResultIds[redisResultIds.length - 1];
	const shouldFallbackToDb =
		noteIds.length === 0 || (ps.sinceId != null && oldestNoteId != null && ps.sinceId < oldestNoteId);

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
			// 渡された snapshot がここで読む種別を全部含んでいるときだけ使う。足りないまま使うと、
			// 引いていない項目が空配列と区別できず、ミュート・ブロックの除外が黙って素通りする
			const relation = viewerRelationSnapshotCovers(ps.viewerRelation, fanoutViewerRelationKinds)
				? ps.viewerRelation
				: await fetchViewerRelationSnapshotFromDatabase(deps.db, me.id, new Date(), fanoutViewerRelationKinds);
			const userIdsWhoMeMuting = new Set(relation.muteeIds);
			const userIdsWhoMeMutingRenotes = new Set(relation.renoteMuteeIds);
			const userIdsWhoBlockingMe = new Set(relation.blockerIds);
			const userMutedInstances = new Set(relation.mutedInstances);
			const userMutedChannels = new Set(relation.mutedChannelIds);

			const parentFilter = filter;
			filter = (note) => {
				if (isUserRelated(note, userIdsWhoBlockingMe, ps.ignoreAuthorFromBlock)) return false;
				if (isUserRelated(note, userIdsWhoMeMuting, ps.ignoreAuthorFromMute)) return false;
				if (isUserRelated(note.renote, userIdsWhoBlockingMe, ps.ignoreAuthorFromBlock)) return false;
				if (isUserRelated(note.renote, userIdsWhoMeMuting, ps.ignoreAuthorFromMute)) return false;
				if (!ps.ignoreAuthorFromMute && isRenote(note) && !isQuote(note) && userIdsWhoMeMutingRenotes.has(note.userId))
					return false;
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
				if (note.userId !== note.renoteUserId && isBlockedHost(deps.meta.blockedHosts, note.renoteUserHost))
					return false;
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

		while (redisResultIds.length - readFromRedis !== 0) {
			const remainingToRead = ps.limit - redisTimeline.length;

			const countToGet = Math.ceil(remainingToRead * Math.min(1.1 / lastSuccessfulRate, 3));
			noteIds = redisResultIds.slice(readFromRedis, readFromRedis + countToGet);

			readFromRedis += noteIds.length;

			const notes = (await listFanoutTimelineNotesByIds(deps.db, noteIds, ps.hydrateChannels ?? false)).filter(filter);
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
