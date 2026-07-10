/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { pollVote, type PollVoteInsert, type PollVoteRow } from '@/db/schema/poll-vote.js';
import { user } from '@/db/schema/user.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiNote } from '@/models/Note.js';
import type { MiPollVote } from '@/models/PollVote.js';
import type { MiUser } from '@/models/User.js';

function deserializePollVote(row: PollVoteRow): MiPollVote {
	return row as MiPollVote;
}

export async function listPollVotesByNoteAndUserFromDatabase(
	db: MiDrizzleDatabase,
	noteId: MiNote['id'],
	userId: MiUser['id'],
): Promise<MiPollVote[]> {
	const rows = await db
		.select()
		.from(pollVote)
		.where(and(
			eq(pollVote.noteId, noteId),
			eq(pollVote.userId, userId),
		));

	return rows.map(row => deserializePollVote(row));
}

export async function fetchPollVoteByNoteAndUserFromDatabase(
	db: MiDrizzleDatabase,
	noteId: MiNote['id'],
	userId: MiUser['id'],
): Promise<MiPollVote | null> {
	const [row] = await db
		.select()
		.from(pollVote)
		.where(and(
			eq(pollVote.noteId, noteId),
			eq(pollVote.userId, userId),
		))
		.limit(1);

	return row == null ? null : deserializePollVote(row);
}

export async function listPollVotesByNoteIdsAndUserFromDatabase(
	db: MiDrizzleDatabase,
	noteIds: MiNote['id'][],
	userId: MiUser['id'],
): Promise<MiPollVote[]> {
	if (noteIds.length === 0) return [];

	const rows = await db
		.select()
		.from(pollVote)
		.where(and(
			inArray(pollVote.noteId, noteIds),
			eq(pollVote.userId, userId),
		));

	return rows.map(row => deserializePollVote(row));
}

export async function listPollVotesByNoteIdsAndUserIdsFromDatabase(
	db: MiDrizzleDatabase,
	noteIds: MiNote['id'][],
	userIds: MiUser['id'][],
): Promise<MiPollVote[]> {
	if (noteIds.length === 0 || userIds.length === 0) return [];

	const rows = await db
		.select()
		.from(pollVote)
		.where(and(
			sql`${pollVote.noteId} = ANY(${sql.param(noteIds)})`,
			sql`${pollVote.userId} = ANY(${sql.param(userIds)})`,
		));

	return rows.map(row => deserializePollVote(row));
}

export async function createPollVoteInDatabase(
	db: MiDrizzleDatabase,
	data: PollVoteInsert,
): Promise<MiPollVote> {
	const [row] = await db
		.insert(pollVote)
		.values(data)
		.returning();

	if (row == null) {
		throw new Error('Failed to create poll vote');
	}

	return deserializePollVote(row);
}

export async function listLocalPollVoterIdsByNoteIdFromDatabase(
	db: MiDrizzleDatabase,
	noteId: MiNote['id'],
): Promise<MiUser['id'][]> {
	const rows = await db
		.selectDistinct({ userId: pollVote.userId })
		.from(pollVote)
		.innerJoin(user, eq(user.id, pollVote.userId))
		.where(and(
			eq(pollVote.noteId, noteId),
			isNull(user.host),
		));

	return rows.map(row => row.userId);
}
