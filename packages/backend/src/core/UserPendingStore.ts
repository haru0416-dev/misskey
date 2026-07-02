/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { eq } from 'drizzle-orm';
import { userPending, type UserPendingInsert, type UserPendingRow } from '@/db/schema/user-pending.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiUserPending } from '@/models/UserPending.js';

function deserializeUserPending(row: UserPendingRow): MiUserPending {
	return row as MiUserPending;
}

export async function createUserPendingInDatabase(db: MiDrizzleDatabase, data: UserPendingInsert): Promise<MiUserPending> {
	const [row] = await db
		.insert(userPending)
		.values(data)
		.returning();

	if (!row) {
		throw new Error('Pending user row was not created');
	}

	return deserializeUserPending(row);
}

export async function fetchUserPendingByCodeFromDatabase(db: MiDrizzleDatabase, code: string): Promise<MiUserPending> {
	const [row] = await db
		.select()
		.from(userPending)
		.where(eq(userPending.code, code))
		.limit(1);

	if (!row) {
		throw new Error(`Pending user not found: ${code}`);
	}

	return deserializeUserPending(row);
}

export async function deleteUserPendingFromDatabase(db: MiDrizzleDatabase, id: MiUserPending['id']): Promise<void> {
	await db
		.delete(userPending)
		.where(eq(userPending.id, id));
}
