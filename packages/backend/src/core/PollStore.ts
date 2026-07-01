/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, desc, eq, gt, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { EntityNotFoundError } from 'typeorm';
import { poll, type PollRow } from '@/db/schema/poll.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { MiPoll } from '@/models/Poll.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';

// poll の noteId 以外 (note / user relation) を参照するダウンストリームは残っていないが、
// MiPoll.note は必須プロパティなので他の移行済み Store と同様に as でキャストする。
function deserializePoll(row: PollRow): MiPoll {
	return row as MiPoll;
}

export async function fetchPollByNoteIdFromDatabase(
	db: MiDrizzleDatabase,
	noteId: MiNote['id'],
): Promise<MiPoll | null> {
	const [row] = await db
		.select()
		.from(poll)
		.where(eq(poll.noteId, noteId))
		.limit(1);

	return row == null ? null : deserializePoll(row);
}

export async function fetchPollByNoteIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	noteId: MiNote['id'],
): Promise<MiPoll> {
	const row = await fetchPollByNoteIdFromDatabase(db, noteId);

	if (row == null) {
		throw new EntityNotFoundError(MiPoll, { noteId });
	}

	return row;
}

/**
 * ApQuestionService のリモート Question 更新同期向け。votes 配列全体を置き換える。
 */
export async function updatePollVotesInDatabase(
	db: MiDrizzleDatabase,
	noteId: MiNote['id'],
	votes: number[],
): Promise<void> {
	await db
		.update(poll)
		.set({ votes })
		.where(eq(poll.noteId, noteId));
}

/**
 * 投票時に該当選択肢の得票数だけをインクリメントする。votes 配列を読み直して丸ごと書き戻すのではなく、
 * 元の TypeORM 実装と同じく SQL の配列添字更新構文 (`votes[n] = votes[n] + 1`) を使う。
 */
export async function incrementPollVoteInDatabase(
	db: MiDrizzleDatabase,
	noteId: MiNote['id'],
	choice: number,
): Promise<void> {
	// In SQL, array index is 1 based
	const index = choice + 1;
	await db.execute(sql`UPDATE "poll" SET "votes"[${index}] = "votes"[${index}] + 1 WHERE "noteId" = ${noteId}`);
}

/**
 * notes/polls/recommendation 向け。まだ投票していない公開範囲 public の投票中アンケートの noteId 一覧を返す。
 * poll_vote は既に drizzle 化済みだが muting は未移行のため、相関サブクエリはテーブル名を直接参照する
 * raw SQL で組み立てる (ChatMessageStore 等の未移行テーブル参照と同じ手法)。
 */
export async function listUnvotedPublicPollNoteIdsFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		meId: MiUser['id'];
		excludeChannels: boolean;
		limit: number;
		offset: number;
	},
): Promise<MiNote['id'][]> {
	const conditions: SQL[] = [
		isNull(poll.userHost),
		ne(poll.userId, options.meId),
		eq(poll.noteVisibility, 'public'),
		or(
			isNull(poll.expiresAt),
			gt(poll.expiresAt, new Date()),
		)!,
		sql`${poll.noteId} NOT IN (SELECT "noteId" FROM "poll_vote" WHERE "userId" = ${options.meId})`,
		sql`${poll.userId} NOT IN (SELECT "muteeId" FROM "muting" WHERE "muterId" = ${options.meId})`,
	];

	if (options.excludeChannels) {
		conditions.push(isNull(poll.channelId));
	}

	const rows = await db
		.select({ noteId: poll.noteId })
		.from(poll)
		.where(and(...conditions))
		.orderBy(desc(poll.noteId))
		.limit(options.limit)
		.offset(options.offset);

	return rows.map(row => row.noteId);
}
