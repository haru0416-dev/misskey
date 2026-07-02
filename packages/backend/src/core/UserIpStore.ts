/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { desc, eq, lt } from 'drizzle-orm';
import { userIp, type UserIpInsert, type UserIpRow } from '@/db/schema/user-ip.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiUser } from '@/models/User.js';

export async function recordUserIpInDatabase(db: MiDrizzleDatabase, data: UserIpInsert): Promise<void> {
	await db
		.insert(userIp)
		.values(data)
		.onConflictDoNothing({
			target: [userIp.userId, userIp.ip],
		});
}

export async function deleteUserIpsOlderThanFromDatabase(db: MiDrizzleDatabase, cutoff: Date): Promise<void> {
	await db
		.delete(userIp)
		.where(lt(userIp.createdAt, cutoff));
}

export async function listUserIpsFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	limit: number,
): Promise<Pick<UserIpRow, 'ip' | 'createdAt'>[]> {
	return db
		.select({
			ip: userIp.ip,
			createdAt: userIp.createdAt,
		})
		.from(userIp)
		.where(eq(userIp.userId, userId))
		.orderBy(desc(userIp.id))
		.limit(limit);
}
