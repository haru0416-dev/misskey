/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, count, eq, gt } from 'drizzle-orm';
import { clipNote, type ClipNoteInsert, type ClipNoteRow } from '@/db/schema/clip-note.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiClip } from '@/models/Clip.js';
import type { MiClipNote } from '@/models/ClipNote.js';
import type { MiNote } from '@/models/Note.js';

function deserializeClipNote(row: ClipNoteRow): MiClipNote {
	return row as MiClipNote;
}

export async function countClipNotesByClipIdFromDatabase(
	db: MiDrizzleDatabase,
	clipId: MiClip['id'],
): Promise<number> {
	const [row] = await db
		.select({ count: count() })
		.from(clipNote)
		.where(eq(clipNote.clipId, clipId));

	return row?.count ?? 0;
}

export async function listClipNotesByClipIdFromDatabase(
	db: MiDrizzleDatabase,
	clipId: MiClip['id'],
	options: {
		afterId?: MiClipNote['id'] | null;
		limit?: number;
	} = {},
): Promise<MiClipNote[]> {
	const conditions = [eq(clipNote.clipId, clipId)];
	if (options.afterId) {
		conditions.push(gt(clipNote.id, options.afterId));
	}

	let query = db
		.select()
		.from(clipNote)
		.where(and(...conditions))
		.orderBy(asc(clipNote.id))
		.$dynamic();

	if (options.limit != null) {
		query = query.limit(options.limit);
	}

	const rows = await query;
	return rows.map(row => deserializeClipNote(row));
}

export async function listClipNoteClipIdsByNoteIdFromDatabase(
	db: MiDrizzleDatabase,
	noteId: MiNote['id'],
): Promise<MiClip['id'][]> {
	const rows = await db
		.select({ clipId: clipNote.clipId })
		.from(clipNote)
		.where(eq(clipNote.noteId, noteId));

	return rows.map(row => row.clipId);
}

export async function createClipNoteInDatabase(
	db: MiDrizzleDatabase,
	data: ClipNoteInsert,
): Promise<MiClipNote> {
	const [row] = await db
		.insert(clipNote)
		.values(data)
		.returning();

	if (row == null) {
		throw new Error('Failed to create clip note');
	}

	return deserializeClipNote(row);
}

export async function deleteClipNoteInDatabase(
	db: MiDrizzleDatabase,
	data: {
		clipId: MiClip['id'];
		noteId: MiNote['id'];
	},
): Promise<void> {
	await db
		.delete(clipNote)
		.where(and(
			eq(clipNote.clipId, data.clipId),
			eq(clipNote.noteId, data.noteId),
		));
}
