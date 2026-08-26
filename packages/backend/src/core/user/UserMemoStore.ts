/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, eq, sql } from 'drizzle-orm';
import { preparedQueryFor, UNNAMED_PREPARED_STATEMENT } from '@/db/prepared.js';
import { userMemo, type UserMemoInsert } from '@/db/schema/user-memo.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiUser } from '@/models/User.js';

export async function deleteUserMemoFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	targetUserId: MiUser['id'],
): Promise<void> {
	await db.delete(userMemo).where(and(eq(userMemo.userId, userId), eq(userMemo.targetUserId, targetUserId)));
}

export async function upsertUserMemoInDatabase(db: MiDrizzleDatabase, data: UserMemoInsert): Promise<void> {
	await db
		.insert(userMemo)
		.values(data)
		.onConflictDoUpdate({
			target: [userMemo.userId, userMemo.targetUserId],
			set: {
				memo: data.memo,
			},
		});
}

export async function fetchUserMemoTextFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	targetUserId: MiUser['id'],
): Promise<string | null> {
	const statement = preparedQueryFor(db, 'userMemo:textByUserIdAndTargetUserId', () =>
		db
			.select({ memo: userMemo.memo })
			.from(userMemo)
			.where(
				and(eq(userMemo.userId, sql.placeholder('userId')), eq(userMemo.targetUserId, sql.placeholder('targetUserId'))),
			)
			.limit(1)
			.prepare(UNNAMED_PREPARED_STATEMENT),
	);
	const [row] = await statement.execute({ userId, targetUserId });

	return row?.memo ?? null;
}

export async function listUserMemoTextsByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<Map<MiUser['id'], string | null>> {
	const statement = preparedQueryFor(db, 'userMemo:textsByUserId', () =>
		db
			.select({
				targetUserId: userMemo.targetUserId,
				memo: userMemo.memo,
			})
			.from(userMemo)
			.where(eq(userMemo.userId, sql.placeholder('userId')))
			.prepare(UNNAMED_PREPARED_STATEMENT),
	);
	const rows = await statement.execute({ userId });

	return new Map(rows.map((row) => [row.targetUserId, row.memo]));
}
