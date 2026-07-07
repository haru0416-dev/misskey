/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, count, desc, eq, gt, inArray, lt, type SQL } from 'drizzle-orm';
import { noteReaction, type NoteReactionInsert, type NoteReactionRow } from '@/db/schema/note-reaction.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import { MiNoteReaction } from '@/models/NoteReaction.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';

export type NoteReactionOrder = 'asc' | 'desc';

export type DeleteNoteReactionResult = {
	affected: number;
};

function noteReactionByUserAndNoteCondition(userId: MiUser['id'], noteId: MiNote['id']) {
	return and(
		eq(noteReaction.userId, userId),
		eq(noteReaction.noteId, noteId),
	);
}

function applyNoteReactionPaginationCondition(
	conditions: SQL[],
	sinceId?: string | null,
	untilId?: string | null,
): void {
	if (sinceId && untilId) {
		conditions.push(gt(noteReaction.id, sinceId));
		conditions.push(lt(noteReaction.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(noteReaction.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(noteReaction.id, untilId));
	}
}

export function resolveNoteReactionPagination(
	idService: { gen(time?: number): string },
	options: {
		sinceId?: string | null;
		untilId?: string | null;
		sinceDate?: number | null;
		untilDate?: number | null;
	},
): {
	sinceId?: string | null;
	untilId?: string | null;
	order: NoteReactionOrder;
} {
	if (options.sinceId && options.untilId) {
		return { sinceId: options.sinceId, untilId: options.untilId, order: 'desc' };
	} else if (options.sinceId) {
		return { sinceId: options.sinceId, untilId: null, order: 'asc' };
	} else if (options.untilId) {
		return { sinceId: null, untilId: options.untilId, order: 'desc' };
	} else if (options.sinceDate && options.untilDate) {
		return { sinceId: idService.gen(options.sinceDate), untilId: idService.gen(options.untilDate), order: 'desc' };
	} else if (options.sinceDate) {
		return { sinceId: idService.gen(options.sinceDate), untilId: null, order: 'asc' };
	} else if (options.untilDate) {
		return { sinceId: null, untilId: idService.gen(options.untilDate), order: 'desc' };
	} else {
		return { sinceId: null, untilId: null, order: 'desc' };
	}
}

export async function fetchNoteReactionByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: NoteReactionRow['id'],
): Promise<NoteReactionRow | null> {
	const [row] = await db
		.select()
		.from(noteReaction)
		.where(eq(noteReaction.id, id))
		.limit(1);

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
	const [row] = await db
		.select()
		.from(noteReaction)
		.where(noteReactionByUserAndNoteCondition(userId, noteId))
		.limit(1);

	return row ?? null;
}

export async function listNoteReactionsByUserAndNoteIdsFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	noteIds: MiNote['id'][],
): Promise<NoteReactionRow[]> {
	if (noteIds.length === 0) return [];

	return await db
		.select()
		.from(noteReaction)
		.where(and(
			eq(noteReaction.userId, userId),
			inArray(noteReaction.noteId, noteIds),
		));
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

export async function createNoteReactionInDatabase(
	db: MiDrizzleDatabase,
	data: NoteReactionInsert,
): Promise<void> {
	await db
		.insert(noteReaction)
		.values(data);
}

export async function deleteNoteReactionByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: NoteReactionRow['id'],
): Promise<DeleteNoteReactionResult> {
	const rows = await db
		.delete(noteReaction)
		.where(eq(noteReaction.id, id))
		.returning({ id: noteReaction.id });

	return { affected: rows.length };
}

export async function countNoteReactionsFromDatabase(
	db: MiDrizzleDatabase,
): Promise<number> {
	const [row] = await db
		.select({ count: count() })
		.from(noteReaction);

	return row?.count ?? 0;
}

export async function listNoteReactionsByUserIdAndNoteIdsFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	noteIds: MiNote['id'][],
): Promise<NoteReactionRow[]> {
	if (noteIds.length === 0) return [];

	return await db
		.select()
		.from(noteReaction)
		.where(and(
			eq(noteReaction.userId, userId),
			inArray(noteReaction.noteId, noteIds),
		));
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
	const conditions: SQL[] = [
		eq(noteReaction.noteId, noteId),
	];

	if (options.type != null) {
		conditions.push(eq(noteReaction.reaction, options.type));
	}

	applyNoteReactionPaginationCondition(conditions, options.sinceId, options.untilId);

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
	const conditions: SQL[] = [
		eq(noteReaction.userId, userId),
	];

	applyNoteReactionPaginationCondition(conditions, options.sinceId, options.untilId);

	return await db
		.select()
		.from(noteReaction)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(noteReaction.id) : desc(noteReaction.id))
		.limit(options.limit);
}
