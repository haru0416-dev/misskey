/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq, gt, lt } from 'drizzle-orm';
import { signin, type SigninInsert, type SigninRow } from '@/db/schema/signin.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiSignin } from '@/models/Signin.js';
import type { MiUser } from '@/models/User.js';

export type SigninHistoryOrder = 'asc' | 'desc';

function deserializeSignin(row: SigninRow): MiSignin {
	return row as MiSignin;
}

function signinHistoryCondition(userId: MiUser['id'], sinceId?: string | null, untilId?: string | null) {
	if (sinceId && untilId) {
		return and(eq(signin.userId, userId), gt(signin.id, sinceId), lt(signin.id, untilId));
	} else if (sinceId) {
		return and(eq(signin.userId, userId), gt(signin.id, sinceId));
	} else if (untilId) {
		return and(eq(signin.userId, userId), lt(signin.id, untilId));
	} else {
		return eq(signin.userId, userId);
	}
}

export async function createSigninInDatabase(db: MiDrizzleDatabase, data: SigninInsert): Promise<MiSignin> {
	const [row] = await db.insert(signin).values(data).returning();
	if (row == null) throw new Error('Signin row was not created');

	return deserializeSignin(row);
}

export async function listSigninsByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<MiSignin[]> {
	const rows = await db.select().from(signin).where(eq(signin.userId, userId));

	return rows.map(deserializeSignin);
}

export async function listSigninHistoryFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	options: {
		limit: number;
		order: SigninHistoryOrder;
		sinceId?: string | null;
		untilId?: string | null;
	},
): Promise<MiSignin[]> {
	const rows = await db
		.select()
		.from(signin)
		.where(signinHistoryCondition(userId, options.sinceId, options.untilId))
		.orderBy(options.order === 'asc' ? asc(signin.id) : desc(signin.id))
		.limit(options.limit);

	return rows.map(deserializeSignin);
}
