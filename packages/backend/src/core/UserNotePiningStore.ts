/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { preparedQueryFor, UNNAMED_PREPARED_STATEMENT } from '@/db/prepared.js';
import { userNotePining, type UserNotePiningInsert, type UserNotePiningRow } from '@/db/schema/user-note-pining.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { acquireAdvisoryTransactionLockInDatabase } from '@/misc/db-advisory-lock.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUserNotePining } from '@/models/UserNotePining.js';
import type { MiUser } from '@/models/User.js';

export type UserNotePiningOrder = 'asc' | 'desc';

function deserializeUserNotePining(row: UserNotePiningRow): MiUserNotePining {
	return row as MiUserNotePining;
}

function userNotePiningCondition(userId: MiUser['id'], noteId: MiNote['id']) {
	return and(eq(userNotePining.userId, userId), eq(userNotePining.noteId, noteId));
}

export async function listUserNotePiningsByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	options: {
		order?: UserNotePiningOrder;
	} = {},
): Promise<MiUserNotePining[]> {
	const order = options.order ?? 'asc';
	const statement = preparedQueryFor(db, `userNotePining:byUserId:${order}`, () =>
		db
			.select()
			.from(userNotePining)
			.where(eq(userNotePining.userId, sql.placeholder('userId')))
			.orderBy(order === 'desc' ? desc(userNotePining.id) : asc(userNotePining.id))
			.prepare(UNNAMED_PREPARED_STATEMENT),
	);
	const rows = await statement.execute({ userId });

	return rows.map((row) => deserializeUserNotePining(row));
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

	// IN (...) は件数ぶんプレースホルダが増えて SQL の形が変わるため、
	// 形を固定できる = ANY(配列1個) にして組み立て済みを使い回す
	const order = options.order ?? 'asc';
	const statement = preparedQueryFor(db, `userNotePining:byUserIds:${order}`, () =>
		db
			.select()
			.from(userNotePining)
			.where(sql`${userNotePining.userId} = ANY(${sql.placeholder('userIds')})`)
			.orderBy(order === 'desc' ? desc(userNotePining.id) : asc(userNotePining.id))
			.prepare(UNNAMED_PREPARED_STATEMENT),
	);
	const rows = await statement.execute({ userIds });

	return rows.map((row) => deserializeUserNotePining(row));
}

export async function createUserNotePiningInDatabase(db: MiDrizzleDatabase, data: UserNotePiningInsert): Promise<void> {
	await db.insert(userNotePining).values(data);
}

export async function createUserNotePiningWithinLimitInDatabase(
	db: MiDrizzleDatabase,
	data: UserNotePiningInsert,
	limit: number,
): Promise<'created' | 'limitExceeded' | 'alreadyPinned'> {
	return await db.transaction(async (tx) => {
		await acquireAdvisoryTransactionLockInDatabase(tx, 'account-pin-limit', data.userId);
		const pinings = await listUserNotePiningsByUserIdFromDatabase(tx, data.userId);
		if (pinings.length >= limit) return 'limitExceeded';
		if (pinings.some((pining) => pining.noteId === data.noteId)) return 'alreadyPinned';

		await tx.insert(userNotePining).values(data);
		return 'created';
	});
}

export async function replaceUserNotePiningsInDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	data: UserNotePiningInsert[],
): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.delete(userNotePining).where(eq(userNotePining.userId, userId));

		if (data.length > 0) {
			await tx.insert(userNotePining).values(data);
		}
	});
}

export async function deleteUserNotePiningFromDatabase(
	db: MiDrizzleDatabase,
	data: {
		userId: MiUser['id'];
		noteId: MiNote['id'];
	},
): Promise<void> {
	await db.delete(userNotePining).where(userNotePiningCondition(data.userId, data.noteId));
}
