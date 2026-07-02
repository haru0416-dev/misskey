/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, eq } from 'drizzle-orm';
import { promoRead, type PromoReadInsert } from '@/db/schema/promo-read.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';

export async function isPromoReadExists(db: MiDrizzleDatabase, userId: MiUser['id'], noteId: MiNote['id']): Promise<boolean> {
	const [row] = await db
		.select({ id: promoRead.id })
		.from(promoRead)
		.where(and(
			eq(promoRead.userId, userId),
			eq(promoRead.noteId, noteId),
		))
		.limit(1);

	return row != null;
}

export async function createPromoReadInDatabase(db: MiDrizzleDatabase, data: PromoReadInsert): Promise<void> {
	await db
		.insert(promoRead)
		.values(data);
}
