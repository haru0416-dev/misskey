/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, eq, inArray } from 'drizzle-orm';
import { noteThreadMuting, type NoteThreadMutingInsert } from '@/db/schema/note-thread-muting.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiUser } from '@/models/User.js';

function noteThreadMutingCondition(userId: MiUser['id'], threadId: string) {
	return and(
		eq(noteThreadMuting.userId, userId),
		eq(noteThreadMuting.threadId, threadId),
	);
}

/** userIds のうち threadId をミュートしているユーザーID一覧 (メンション通知の一括判定用)。 */
export async function listNoteThreadMutedUserIdsFromDatabase(
	db: MiDrizzleDatabase,
	threadId: string,
	userIds: MiUser['id'][],
): Promise<MiUser['id'][]> {
	if (userIds.length === 0) return [];

	const rows = await db
		.select({ userId: noteThreadMuting.userId })
		.from(noteThreadMuting)
		.where(and(
			eq(noteThreadMuting.threadId, threadId),
			inArray(noteThreadMuting.userId, userIds),
		));

	return rows.map(row => row.userId);
}

export async function noteThreadMutingExistsInDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	threadId: string,
): Promise<boolean> {
	const [row] = await db
		.select({ id: noteThreadMuting.id })
		.from(noteThreadMuting)
		.where(noteThreadMutingCondition(userId, threadId))
		.limit(1);

	return row != null;
}

export async function createNoteThreadMutingInDatabase(
	db: MiDrizzleDatabase,
	data: NoteThreadMutingInsert,
): Promise<void> {
	await db
		.insert(noteThreadMuting)
		.values(data);
}

export async function deleteNoteThreadMutingFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	threadId: string,
): Promise<void> {
	await db
		.delete(noteThreadMuting)
		.where(noteThreadMutingCondition(userId, threadId));
}
