/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, eq, sql, getTableName } from 'drizzle-orm';
import { defineQueryPlan } from '@/db/prepared.js';
import { userMemo } from '@/db/schema/user-memo.js';
import type { UserMemoInsert } from '@/db/schema/user-memo.js';
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

const userMemoTextByUserIdAndTargetUserIdPlan = defineQueryPlan((db) => {
	const selection = { memo: userMemo.memo };
	return {
		query: db
			.select(selection)
			.from(userMemo)
			.where(
				and(eq(userMemo.userId, sql.placeholder('userId')), eq(userMemo.targetUserId, sql.placeholder('targetUserId'))),
			)
			.limit(1),
		selection,
		metadata: { type: 'select', tables: [getTableName(userMemo)] },
	};
});

export async function fetchUserMemoTextFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	targetUserId: MiUser['id'],
): Promise<string | null> {
	const [row] = await userMemoTextByUserIdAndTargetUserIdPlan.execute(db, { userId, targetUserId });

	return row?.memo ?? null;
}

const userMemoTextsByUserIdPlan = defineQueryPlan((db) => {
	const selection = {
		targetUserId: userMemo.targetUserId,
		memo: userMemo.memo,
	};
	return {
		query: db
			.select(selection)
			.from(userMemo)
			.where(
				and(
					eq(userMemo.userId, sql.placeholder('userId')),
					sql`${userMemo.targetUserId} = ANY(${sql.placeholder('targetUserIds')})`,
				),
			),
		selection,
		metadata: { type: 'select', tables: [getTableName(userMemo)] },
	};
});

export async function listUserMemoTextsByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	targetUserIds: MiUser['id'][],
): Promise<Map<MiUser['id'], string | null>> {
	if (targetUserIds.length === 0) {
		return new Map();
	}

	const rows = await userMemoTextsByUserIdPlan.execute(db, { userId, targetUserIds });

	return new Map(rows.map((row) => [row.targetUserId, row.memo]));
}
