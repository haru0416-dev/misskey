/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { userNotePining, type UserNotePiningInsert, type UserNotePiningRow } from '@/db/schema/user-note-pining.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUserNotePining } from '@/models/UserNotePining.js';
import type { MiUser } from '@/models/User.js';

export type UserNotePiningOrder = 'asc' | 'desc';

function deserializeUserNotePining(row: UserNotePiningRow): MiUserNotePining {
	return row as MiUserNotePining;
}

function userNotePiningCondition(userId: MiUser['id'], noteId: MiNote['id']) {
	return and(
		eq(userNotePining.userId, userId),
		eq(userNotePining.noteId, noteId),
	);
}

export async function listUserNotePiningsByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	options: {
		order?: UserNotePiningOrder;
	} = {},
): Promise<MiUserNotePining[]> {
	const rows = await db
		.select()
		.from(userNotePining)
		.where(eq(userNotePining.userId, userId))
		.orderBy((options.order ?? 'asc') === 'desc' ? desc(userNotePining.id) : asc(userNotePining.id));

	return rows.map(row => deserializeUserNotePining(row));
}

export async function listUserNotePiningsByUserIdsFromDatabase(
	db: MiDrizzleDatabase,
	userIds: MiUser['id'][],
	options: {
		order?: UserNotePiningOrder;
	} = {},
): Promise<MiUserNotePining[]> {
	if (userIds.length === 0) {
		return [];
	}

	const rows = await db
		.select()
		.from(userNotePining)
		.where(inArray(userNotePining.userId, userIds))
		.orderBy((options.order ?? 'asc') === 'desc' ? desc(userNotePining.id) : asc(userNotePining.id));

	return rows.map(row => deserializeUserNotePining(row));
}

export async function createUserNotePiningInDatabase(
	db: MiDrizzleDatabase,
	data: UserNotePiningInsert,
): Promise<void> {
	await db
		.insert(userNotePining)
		.values(data);
}

export async function deleteUserNotePiningFromDatabase(
	db: MiDrizzleDatabase,
	data: {
		userId: MiUser['id'];
		noteId: MiNote['id'];
	},
): Promise<void> {
	await db
		.delete(userNotePining)
		.where(userNotePiningCondition(data.userId, data.noteId));
}
