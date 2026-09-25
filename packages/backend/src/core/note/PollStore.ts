/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, desc, eq, gt, inArray, isNull, ne, or, sql, getTableColumns, getTableName } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { defineQueryPlan } from '@/db/prepared.js';
import { poll } from '@/db/schema/poll.js';
import type { PollInsert, PollRow } from '@/db/schema/poll.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import { MiPoll } from '@/models/Poll.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';

// MiPoll.note は必須だが、この Store の利用側は noteId 以外の relation を参照しない。
function deserializePoll(row: PollRow): MiPoll {
	return row as MiPoll;
}

export async function createPollInDatabase(db: MiDrizzleDatabase, values: PollInsert): Promise<void> {
	await db.insert(poll).values(values);
}

export async function fetchPollByNoteIdFromDatabase(
	db: MiDrizzleDatabase,
	noteId: MiNote['id'],
): Promise<MiPoll | null> {
	const [row] = await db.select().from(poll).where(eq(poll.noteId, noteId)).limit(1);

	return row == null ? null : deserializePoll(row);
}

const pollByNoteIdsPlan = defineQueryPlan((db) => {
	const selection = getTableColumns(poll);
	return {
		query: db
			.select(selection)
			.from(poll)
			.where(sql`${poll.noteId} = ANY(${sql.placeholder('noteIds')})`),
		selection,
		metadata: { type: 'select', tables: [getTableName(poll)] },
	};
});

export async function listPollsByNoteIdsFromDatabase(
	db: MiDrizzleDatabase,
	noteIds: MiNote['id'][],
): Promise<MiPoll[]> {
	if (noteIds.length === 0) {
		return [];
	}

	// IN (...) は件数ぶんプレースホルダが増えて SQL の形が変わるため、
	// 形を固定できる = ANY(配列1個) にして組み立て済みを使い回す
	const rows = await pollByNoteIdsPlan.execute(db, { noteIds });

	return rows.map((row) => deserializePoll(row));
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

/** リモートの Question の同期向け。votes 配列全体を置き換える。 */
export async function updatePollVotesInDatabase(
	db: MiDrizzleDatabase,
	noteId: MiNote['id'],
	votes: number[],
): Promise<void> {
	await db.update(poll).set({ votes }).where(eq(poll.noteId, noteId));
}

/** votes 配列を読み直して書き戻さず、配列添字の更新で該当選択肢だけを加算する。 */
export async function incrementPollVoteInDatabase(
	db: MiDrizzleDatabase,
	noteId: MiNote['id'],
	choice: number,
): Promise<void> {
	// SQL の配列添字は 1 始まり。
	const index = choice + 1;
	await db.execute(sql`UPDATE "poll" SET "votes"[${index}] = "votes"[${index}] + 1 WHERE "noteId" = ${noteId}`);
}

/** notes/polls/recommendation 向け。自分が投票していない、公開範囲 public の投票中アンケートの noteId 一覧。 */
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
		or(isNull(poll.expiresAt), gt(poll.expiresAt, new Date()))!,
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

	return rows.map((row) => row.noteId);
}
