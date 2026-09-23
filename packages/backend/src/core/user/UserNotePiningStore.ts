/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq, inArray, sql, getTableColumns, getTableName } from 'drizzle-orm';
import { defineQueryPlan } from '@/db/prepared.js';
import { userNotePining } from '@/db/schema/user-note-pining.js';
import type { UserNotePiningInsert, UserNotePiningRow } from '@/db/schema/user-note-pining.js';
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

const userNotePiningsByUserIdPlans = (['asc', 'desc'] as const).map((order) =>
	defineQueryPlan((db) => {
		const selection = getTableColumns(userNotePining);
		return {
			query: db
				.select(selection)
				.from(userNotePining)
				.where(eq(userNotePining.userId, sql.placeholder('userId')))
				.orderBy(order === 'desc' ? desc(userNotePining.id) : asc(userNotePining.id)),
			selection,
			metadata: { type: 'select', tables: [getTableName(userNotePining)] },
		};
	}),
);

export async function listUserNotePiningsByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	options: {
		order?: UserNotePiningOrder;
	} = {},
): Promise<MiUserNotePining[]> {
	const order = options.order ?? 'asc';
	const plan = userNotePiningsByUserIdPlans[order === 'desc' ? 1 : 0]!;
	const rows = await plan.execute(db, { userId });

	return rows.map((row) => deserializeUserNotePining(row));
}

const userNotePiningsByUserIdsPlans = (['asc', 'desc'] as const).map((order) =>
	defineQueryPlan((db) => {
		const selection = getTableColumns(userNotePining);
		return {
			query: db
				.select(selection)
				.from(userNotePining)
				.where(sql`${userNotePining.userId} = ANY(${sql.placeholder('userIds')})`)
				.orderBy(order === 'desc' ? desc(userNotePining.id) : asc(userNotePining.id)),
			selection,
			metadata: { type: 'select', tables: [getTableName(userNotePining)] },
		};
	}),
);

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
	const plan = userNotePiningsByUserIdsPlans[order === 'desc' ? 1 : 0]!;
	const rows = await plan.execute(db, { userIds });

	return rows.map((row) => deserializeUserNotePining(row));
}

export async function createUserNotePiningWithinLimitInDatabase(
	db: MiDrizzleDatabase,
	data: UserNotePiningInsert,
	limit: number,
): Promise<'created' | 'limitExceeded' | 'alreadyPinned'> {
	return await db.transaction(async (tx) => {
		await acquireAdvisoryTransactionLockInDatabase(tx, 'account-pin-limit', data.userId);
		const pinings = await listUserNotePiningsByUserIdFromDatabase(tx, data.userId);
		if (pinings.length >= limit) {
			return 'limitExceeded';
		}
		if (pinings.some((pining) => pining.noteId === data.noteId)) {
			return 'alreadyPinned';
		}

		await tx.insert(userNotePining).values(data);
		return 'created';
	});
}

async function replaceUserNotePiningsInDatabase(
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
