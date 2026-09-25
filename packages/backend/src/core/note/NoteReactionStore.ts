/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, count, desc, eq, sql, getTableColumns, getTableName } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { defineQueryPlan } from '@/db/prepared.js';
import { noteReaction } from '@/db/schema/note-reaction.js';
import type { NoteReactionInsert, NoteReactionRow } from '@/db/schema/note-reaction.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import { MiNoteReaction } from '@/models/NoteReaction.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { pushIdPaginationConditions } from '@/db/id-pagination.js';

export type NoteReactionOrder = 'asc' | 'desc';

export type DeleteNoteReactionResult = {
	affected: number;
};

function noteReactionByUserAndNoteCondition(userId: MiUser['id'], noteId: MiNote['id']) {
	return and(eq(noteReaction.userId, userId), eq(noteReaction.noteId, noteId));
}

export async function fetchNoteReactionByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: NoteReactionRow['id'],
): Promise<NoteReactionRow | null> {
	const [row] = await db.select().from(noteReaction).where(eq(noteReaction.id, id)).limit(1);

	return row ?? null;
}

export async function fetchNoteReactionByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: NoteReactionRow['id'],
): Promise<NoteReactionRow> {
	const row = await fetchNoteReactionByIdFromDatabase(db, id);

	if (row == null) {
		throw new EntityNotFoundError(MiNoteReaction, { id });
	}

	return row;
}

export async function fetchNoteReactionByUserAndNoteFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	noteId: MiNote['id'],
): Promise<NoteReactionRow | null> {
	const [row] = await db.select().from(noteReaction).where(noteReactionByUserAndNoteCondition(userId, noteId)).limit(1);

	return row ?? null;
}

const noteReactionByUserIdAndNoteIdsPlan = defineQueryPlan((db) => {
	const selection = getTableColumns(noteReaction);
	return {
		query: db
			.select(selection)
			.from(noteReaction)
			.where(
				and(
					eq(noteReaction.userId, sql.placeholder('userId')),
					sql`${noteReaction.noteId} = ANY(${sql.placeholder('noteIds')})`,
				),
			),
		selection,
		metadata: { type: 'select', tables: [getTableName(noteReaction)] },
	};
});

export async function listNoteReactionsByUserAndNoteIdsFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	noteIds: MiNote['id'][],
): Promise<NoteReactionRow[]> {
	if (noteIds.length === 0) {
		return [];
	}

	// IN (...) は件数ぶんプレースホルダが増えて SQL の形が変わるため、
	// 形を固定できる = ANY(配列1個) にして組み立て済みを使い回す
	return await noteReactionByUserIdAndNoteIdsPlan.execute(db, { userId, noteIds });
}

const noteReactionByNoteIdsAndUserIdsPlan = defineQueryPlan((db) => {
	const selection = getTableColumns(noteReaction);
	return {
		query: db
			.select(selection)
			.from(noteReaction)
			.where(
				and(
					sql`${noteReaction.noteId} = ANY(${sql.placeholder('noteIds')})`,
					sql`${noteReaction.userId} = ANY(${sql.placeholder('userIds')})`,
				),
			),
		selection,
		metadata: { type: 'select', tables: [getTableName(noteReaction)] },
	};
});

export async function listNoteReactionsByNoteIdsAndUserIdsFromDatabase(
	db: MiDrizzleDatabase,
	noteIds: MiNote['id'][],
	userIds: MiUser['id'][],
): Promise<NoteReactionRow[]> {
	if (noteIds.length === 0 || userIds.length === 0) {
		return [];
	}

	return await noteReactionByNoteIdsAndUserIdsPlan.execute(db, { noteIds, userIds });
}

export async function fetchNoteReactionByUserAndNoteOrFailFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	noteId: MiNote['id'],
): Promise<NoteReactionRow> {
	const row = await fetchNoteReactionByUserAndNoteFromDatabase(db, userId, noteId);

	if (row == null) {
		throw new EntityNotFoundError(MiNoteReaction, { userId, noteId });
	}

	return row;
}

export async function createNoteReactionInDatabase(db: MiDrizzleDatabase, data: NoteReactionInsert): Promise<void> {
	await db.insert(noteReaction).values(data);
}

export async function deleteNoteReactionByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: NoteReactionRow['id'],
): Promise<DeleteNoteReactionResult> {
	const rows = await db.delete(noteReaction).where(eq(noteReaction.id, id)).returning({ id: noteReaction.id });

	return { affected: rows.length };
}

export async function countNoteReactionsFromDatabase(db: MiDrizzleDatabase): Promise<number> {
	const [row] = await db.select({ count: count() }).from(noteReaction);

	return row?.count ?? 0;
}

export async function listNoteReactionsByNoteIdFromDatabase(
	db: MiDrizzleDatabase,
	noteId: MiNote['id'],
	options: {
		limit: number;
		order: NoteReactionOrder;
		sinceId?: string | null;
		untilId?: string | null;
		type?: string | null;
	},
): Promise<NoteReactionRow[]> {
	const conditions: SQL[] = [eq(noteReaction.noteId, noteId)];

	if (options.type != null) {
		conditions.push(eq(noteReaction.reaction, options.type));
	}

	pushIdPaginationConditions(conditions, noteReaction.id, options.sinceId, options.untilId);

	return await db
		.select()
		.from(noteReaction)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(noteReaction.id) : desc(noteReaction.id))
		.limit(options.limit);
}

export async function listNoteReactionsByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	options: {
		limit: number;
		order: NoteReactionOrder;
		sinceId?: string | null;
		untilId?: string | null;
	},
): Promise<NoteReactionRow[]> {
	const conditions: SQL[] = [eq(noteReaction.userId, userId)];

	pushIdPaginationConditions(conditions, noteReaction.id, options.sinceId, options.untilId);

	return await db
		.select()
		.from(noteReaction)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(noteReaction.id) : desc(noteReaction.id))
		.limit(options.limit);
}
