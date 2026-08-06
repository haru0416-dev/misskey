/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { eq } from 'drizzle-orm';
import { promoNote, type PromoNoteInsert } from '@/db/schema/promo-note.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiNote } from '@/models/Note.js';

export async function isPromoNoteExists(db: MiDrizzleDatabase, noteId: MiNote['id']): Promise<boolean> {
	const [row] = await db
		.select({ noteId: promoNote.noteId })
		.from(promoNote)
		.where(eq(promoNote.noteId, noteId))
		.limit(1);

	return row != null;
}

export async function createPromoNoteInDatabase(db: MiDrizzleDatabase, data: PromoNoteInsert): Promise<void> {
	await db.insert(promoNote).values(data);
}
