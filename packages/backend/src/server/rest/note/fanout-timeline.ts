/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';
import { listChannelsByIdsFromDatabase } from '@/core/channel/channel-store.js';
import { isFanoutTimelineSortReady, sortFanoutTimelineLists } from '@/core/note/fanout-timeline-push.js';
import { listNotesByIdsFromDatabase } from '@/core/note/note-store.js';
import { listUsersByIdsFromDatabase } from '@/core/user/user-store.js';
import {
	fanoutViewerRelationKinds,
	fetchViewerRelationSnapshotFromDatabase,
	viewerRelationSnapshotCovers,
} from '@/core/user/viewer-relation-store.js';
import { isChannelRelated } from '@/misc/is-channel-related.js';
import { isHostInDenyList } from '@/misc/host-list.js';
import { isInstanceMuted } from '@/misc/is-instance-muted.js';
import { isQuote, isRenote } from '@/misc/is-renote.js';
import { isReply } from '@/misc/is-reply.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/entities.js';
import type { MiChannel } from '@/models/Channel.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import type { ViewerRelationSnapshot } from '@/core/user/viewer-relation-store.js';

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
		if (note.replyId != null) {
			relationIds.add(note.replyId);
		}
		if (note.renoteId != null) {
			relationIds.add(note.renoteId);
		}
		if (note.replyUserId != null) {
			userIds.add(note.replyUserId);
		}
		if (note.renoteUserId != null) {
			userIds.add(note.renoteUserId);
		}
		if (hydrateChannels) {
			// renoteChannelId は作成時に非正規化済みなので、リノート先の取得を待たずにチャンネルを一括取得できる。
			if (note.channelId != null) {
				channelIds.add(note.channelId);
			}
			if (note.renoteChannelId != null) {
				channelIds.add(note.renoteChannelId);
			}
		}
	}

	const [relations, users, channels] = await Promise.all([
		listNotesByIdsFromDatabase(db, [...relationIds]),
		listUsersByIdsFromDatabase(db, [...userIds], { includeSuspended: true }),
		// 空配列なら DB クエリを発行しないため、チャンネル情報が不要な呼び出し元には取得コストを課さない。
		listChannelsByIdsFromDatabase(db, [...channelIds]),
	]);
	const relationById = new Map(relations.map((note) => [note.id, note]));
	const userById = new Map(users.map((user) => [user.id, user]));
	const channelById = new Map(channels.map((channel) => [channel.id, channel]));

	return notes.flatMap((note) => {
		const user = userById.get(note.userId);
		if (user == null) {
			return [];
		}

		note.user = user;
		if (hydrateChannels) {
			note.channel = note.channelId == null ? null : (channelById.get(note.channelId) ?? null);
		}
		note.reply = note.replyId == null ? null : (relationById.get(note.replyId) ?? null);
		note.renote = note.renoteId == null ? null : (relationById.get(note.renoteId) ?? null);
		if (note.reply != null) {
			note.reply.user = userById.get(note.reply.userId) ?? null;
		}
		if (note.renote != null) {
			note.renote.user = userById.get(note.renote.userId) ?? null;
			if (hydrateChannels) {
				note.renote.channel = note.renote.channelId == null ? null : (channelById.get(note.renote.channelId) ?? null);
			}
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
	 * fanoutViewerRelationKinds を満たす取得済みのコンテキストなら再利用する。不足していれば取り直す。
	 */
	viewerRelation?: ViewerRelationSnapshot | undefined;
	useDbFallback: boolean;
	redisTimelines: string[];
	noteFilter?: NoteFilter;
	/**
	 * noteFilter が `note.channel` / `note.renote.channel` を読むなら true にすること。
	 * false では関連を取得せず null のままなので、チャンネル属性による除外が欠落する。
	 * ID 列だけで判定する場合は取得不要。
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
	return isHostInDenyList(blockedHosts, host);
}

const descending = (a: string, b: string) => (a > b ? -1 : 1);

/** タイムラインの候補 ID を新しい順・重複なしで少しずつ渡す。 */
export interface TimelineIdSource {
	/** 次の最大 n 件。 */
	take(n: number): Promise<string[]>;
	hasMore(): Promise<boolean>;
}

/** 全 list を一度に読み、和集合を並べ替える。list の並び順に依存しない。 */
export async function readWholeTimelineLists(
	redis: Redis.Redis,
	names: string[],
	untilId: string | null,
): Promise<TimelineIdSource> {
	const pipeline = redis.pipeline();
	for (const name of names) {
		pipeline.lrange('list:' + name, 0, -1);
	}
	const unique = new Set<string>();
	for (const [error, ids] of (await pipeline.exec()) ?? []) {
		if (error) {
			throw error;
		}
		for (const id of ids as string[]) {
			if (untilId == null || id < untilId) {
				unique.add(id);
			}
		}
	}
	const sorted = [...unique].sort(descending);
	let read = 0;
	return {
		take: async (n) => {
			const ids = sorted.slice(read, read + n);
			read += ids.length;
			return ids;
		},
		hasMore: async () => read < sorted.length,
	};
}

/** 範囲読みした list に降順でない箇所があった。そのリクエストは全件読みでやり直す。 */
export class UnsortedTimelineListError extends Error {
	constructor(public readonly key: string) {
		super(`Timeline list is not sorted: ${key}`);
	}
}

type ListCursor = {
	key: string;
	/** 次に LRANGE で読む位置。 */
	start: number;
	/** 次に読む件数。 */
	size: number;
	/** これより古い ID だけを候補にする。初期値は untilId、以後はこの list から読んだ最古の ID。 */
	bound: string | null;
	/** 前の回に読んだ範囲の最後の ID。次の回の先頭と比べ、回の境目の崩れも見つける。 */
	lastRead: string | null;
	buffer: string[];
	offset: number;
	exhausted: boolean;
};

/**
 * 降順・重複なしの list (fanout-timeline-push.ts が保つ) を先頭から size 件ずつ読み、降順のまま併合する。
 *
 * 続きは位置で読み、値 (bound) で絞る。読む間に list へ入るのは降順の位置への挿入と末尾の切り詰めだけなので、
 * 読んだ位置より前に入った ID の分だけ既読の ID が後ろへずれて再び読まれ (bound 以上なので捨てる)、未読の ID は
 * 読む位置より前へ動かない。bound より古い ID は既読の ID より後ろにしか入らない。したがって抜けも重複も出ない。
 *
 * 読んだ範囲は、回の境目も含めて降順であることを確かめ、崩れていれば UnsortedTimelineListError を投げる。
 * 降順を保たない書き込み (旧版のプロセス) が並べ直しの後に混ざっても、読んだ範囲の崩れは必ず見つかる。
 * 読む合間に読んだ位置より前へ 2 件以上入ると、再び読む既読の ID が境目で前の回の最後より新しくなり、崩れと
 * 区別できないので同じく投げる。呼び出し側は全件読みでやり直すので結果は正しく、1 リクエストの往復の間に
 * 同じ list へ 2 件以上入るときだけ起きる。
 *
 * untilId より新しい部分も読んで確かめる (位置だけ求めて読み飛ばすと、その間の崩れを見落とす)。untilId はたいてい
 * 前のページの最後の ID で、その list にあれば最初の往復で LPOS が位置を返すので、2 往復目でそこまでまとめて
 * 読む。無い list (他の list から来た ID、切り詰め済み) では、読み飛ばしが続くたびに 1 回に読む件数を倍にして
 * 往復を log 回に抑える。
 * 位置を値の二分探索 (Valkey 側の Lua) で求める方式は往復が 1 回で済むが、Lua の呼び出しが Valkey の単一スレッドを
 * 1 回あたり約 50µs 占有し、アプリの CPU は変わらない。
 */
export class SortedTimelineListsReader implements TimelineIdSource {
	private readonly cursors: ListCursor[];
	private lastTaken: string | null = null;

	constructor(
		private readonly redis: Redis.Redis,
		names: string[],
		untilId: string | null,
		private readonly size: number,
	) {
		this.cursors = names.map((name) => ({
			key: 'list:' + name,
			start: 0,
			size,
			bound: untilId,
			lastRead: null,
			buffer: [],
			offset: 0,
			exhausted: false,
		}));
	}

	/** 読み切っていない list すべてに未出力の候補が 1 件以上ある状態にする。併合の比較にはそれが要る。 */
	private async fill(): Promise<void> {
		for (;;) {
			const targets = this.cursors.filter((c) => !c.exhausted && c.offset >= c.buffer.length);
			if (targets.length === 0) {
				return;
			}
			const pipeline = this.redis.pipeline();
			const located: boolean[] = [];
			for (const c of targets) {
				pipeline.lrange(c.key, c.start, c.start + c.size - 1);
				// untilId 付きの最初の読み取りでは、untilId の位置も同じ往復で聞いておく。
				const locate = c.start === 0 && c.bound != null;
				if (locate) {
					pipeline.lpos(c.key, c.bound!);
				}
				located.push(locate);
			}
			const results = (await pipeline.exec()) ?? [];
			let r = 0;
			const next = (): unknown => {
				const [error, value] = results[r++] ?? [new Error('Missing pipeline result'), null];
				if (error) {
					throw error;
				}
				return value;
			};
			targets.forEach((c, i) => {
				const ids = next() as string[];
				const untilPosition = located[i] ? (next() as number | null) : null;
				// 同じ ID が続くのは、読む合間に 1 件入って既読の最後の ID を再び読んだときなので許す。
				let previous = c.lastRead;
				for (const id of ids) {
					if (previous != null && id > previous) {
						throw new UnsortedTimelineListError(c.key);
					}
					previous = id;
				}
				c.lastRead = previous;
				c.start += ids.length;
				c.exhausted = ids.length < c.size;
				const bound = c.bound;
				c.buffer = bound == null ? ids : ids.filter((id) => id < bound);
				c.offset = 0;
				if (c.buffer.length > 0) {
					c.bound = c.buffer[c.buffer.length - 1]!;
					c.size = this.size;
				} else if (!c.exhausted) {
					// 降順・重複なしなので、untilId の次の位置からが untilId より古い。そこまでを次の回にまとめて読む。
					c.size =
						untilPosition != null && untilPosition >= c.start ? untilPosition + 1 - c.start + this.size : c.size * 2;
				}
			});
		}
	}

	/** 次に出す ID の持ち主。複数の list にある同じ ID は 2 回目以降を読み飛ばす。 */
	private async peek(): Promise<ListCursor | null> {
		for (;;) {
			await this.fill();
			let best: ListCursor | null = null;
			for (const c of this.cursors) {
				if (c.offset < c.buffer.length && (best == null || c.buffer[c.offset]! > best.buffer[best.offset]!)) {
					best = c;
				}
			}
			if (best == null || best.buffer[best.offset] !== this.lastTaken) {
				return best;
			}
			best.offset++;
		}
	}

	public async take(n: number): Promise<string[]> {
		const ids: string[] = [];
		while (ids.length < n) {
			const next = await this.peek();
			if (next == null) {
				break;
			}
			const id = next.buffer[next.offset++]!;
			this.lastTaken = id;
			ids.push(id);
		}
		return ids;
	}

	public async hasMore(): Promise<boolean> {
		return (await this.peek()) != null;
	}
}

export async function fetchFanoutTimelineNotes(
	deps: FanoutTimelineReadDependencies,
	ps: FanoutTimelineReadOptions,
): Promise<MiNote[]> {
	const dbFallback = ps.useDbFallback ? ps.dbFallback : () => Promise.resolve([]);

	// sinceId があると Redis の候補はすべて sinceId より新しいので、「候補が無い」か「候補の最古が sinceId より
	// 新しい (間が抜けているかもしれない)」のどちらかになり、どちらでも DB だけで引く。Redis の候補は使われない。
	if (ps.sinceId != null) {
		return await dbFallback(ps.untilId, ps.sinceId, ps.limit);
	}

	if (await isFanoutTimelineSortReady(deps.redisForTimelines)) {
		// 最初に 1.1 × limit 件を取り、絞り込みで落ちた分を後から足す。2 × limit 件ずつ読めば多くは 1 往復で済む。
		const reader = new SortedTimelineListsReader(deps.redisForTimelines, ps.redisTimelines, ps.untilId, ps.limit * 2);
		try {
			return await collectFanoutTimelineNotes(deps, ps, dbFallback, reader);
		} catch (error) {
			if (!(error instanceof UnsortedTimelineListError)) {
				throw error;
			}
			// 並べ直しの後に降順を保たない書き込み (旧版のプロセス、手作業) があった。その list を並べ直し、
			// このリクエストは全件読みでやり直す。
			await sortFanoutTimelineLists(deps.redisForTimelines, [error.key]);
		}
	}
	return await collectFanoutTimelineNotes(
		deps,
		ps,
		dbFallback,
		await readWholeTimelineLists(deps.redisForTimelines, ps.redisTimelines, ps.untilId),
	);
}

async function collectFanoutTimelineNotes(
	deps: FanoutTimelineReadDependencies,
	ps: FanoutTimelineReadOptions,
	dbFallback: (untilId: string | null, sinceId: string | null, limit: number) => Promise<MiNote[]>,
	source: TimelineIdSource,
): Promise<MiNote[]> {
	let noteIds = await source.take(Math.ceil(ps.limit * 1.1));

	if (noteIds.length !== 0) {
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
			// 未取得の項目を空配列と区別できず、ミュート・ブロックの除外が欠落する。
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
				if (isUserRelated(note, userIdsWhoBlockingMe, ps.ignoreAuthorFromBlock)) {
					return false;
				}
				if (isUserRelated(note, userIdsWhoMeMuting, ps.ignoreAuthorFromMute)) {
					return false;
				}
				if (isUserRelated(note.renote, userIdsWhoBlockingMe, ps.ignoreAuthorFromBlock)) {
					return false;
				}
				if (isUserRelated(note.renote, userIdsWhoMeMuting, ps.ignoreAuthorFromMute)) {
					return false;
				}
				if (
					!ps.ignoreAuthorFromMute &&
					isRenote(note) &&
					!isQuote(note) &&
					userIdsWhoMeMutingRenotes.has(note.userId)
				) {
					return false;
				}
				if (isInstanceMuted(note, userMutedInstances)) {
					return false;
				}
				if (isChannelRelated(note, userMutedChannels, ps.ignoreAuthorChannelFromMute)) {
					return false;
				}

				return parentFilter(note);
			};
		}

		{
			const parentFilter = filter;
			filter = (note) => {
				if (!ps.ignoreAuthorFromInstanceBlock) {
					if (isBlockedHost(deps.meta.blockedHosts, note.userHost)) {
						return false;
					}
				}
				if (note.userId !== note.renoteUserId && isBlockedHost(deps.meta.blockedHosts, note.renoteUserHost)) {
					return false;
				}
				if (note.userId !== note.replyUserId && isBlockedHost(deps.meta.blockedHosts, note.replyUserHost)) {
					return false;
				}

				return parentFilter(note);
			};
		}

		{
			const parentFilter = filter;
			filter = (note) => {
				if (!ps.ignoreAuthorFromUserSuspension) {
					if (note.user!.isSuspended) {
						return false;
					}
				}
				if (note.userId !== note.renoteUserId && note.renote?.user?.isSuspended) {
					return false;
				}
				if (note.userId !== note.replyUserId && note.reply?.user?.isSuspended) {
					return false;
				}

				return parentFilter(note);
			};
		}

		const redisTimeline: MiNote[] = [];
		for (;;) {
			const notes = (await listFanoutTimelineNotesByIds(deps.db, noteIds, ps.hydrateChannels ?? false)).filter(filter);
			notes.sort((a, b) => descending(a.id, b.id));
			redisTimeline.push(...notes);
			const lastSuccessfulRate = notes.length / noteIds.length;

			if (ps.allowPartial ? redisTimeline.length !== 0 : redisTimeline.length >= ps.limit) {
				return redisTimeline.slice(0, ps.limit);
			}
			if (!(await source.hasMore())) {
				break;
			}

			const remainingToRead = ps.limit - redisTimeline.length;
			noteIds = await source.take(Math.ceil(remainingToRead * Math.min(1.1 / lastSuccessfulRate, 3)));
		}

		// Redis の候補を読み切った。最古の候補より古い分を DB で補う。
		const gotFromDb = await dbFallback(noteIds[noteIds.length - 1]!, null, ps.limit - redisTimeline.length);
		return [...redisTimeline, ...gotFromDb];
	}

	return await dbFallback(ps.untilId, null, ps.limit);
}
