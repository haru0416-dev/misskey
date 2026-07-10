/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, count, eq, inArray } from 'drizzle-orm';
import { userSecurityKey, type UserSecurityKeyInsert, type UserSecurityKeyRow } from '@/db/schema/user-security-key.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiUser } from '@/models/User.js';

export type UserSecurityKeySummary = Pick<UserSecurityKeyRow, 'id' | 'name' | 'lastUsed'>;

export type UserSecurityKeyUsage = {
	lastUsed: Date;
	counter: number;
	credentialDeviceType: string;
	credentialBackedUp: boolean;
};

export async function listUserSecurityKeysByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<UserSecurityKeyRow[]> {
	return await db
		.select()
		.from(userSecurityKey)
		.where(eq(userSecurityKey.userId, userId));
}

export async function countUserSecurityKeysByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<number> {
	const [row] = await db
		.select({ count: count() })
		.from(userSecurityKey)
		.where(eq(userSecurityKey.userId, userId));

	return row?.count ?? 0;
}

export async function listUserIdsWithSecurityKeysFromDatabase(
	db: MiDrizzleDatabase,
	userIds: MiUser['id'][],
): Promise<MiUser['id'][]> {
	if (userIds.length === 0) {
		return [];
	}

	const rows = await db
		.select({ userId: userSecurityKey.userId })
		.from(userSecurityKey)
		.where(inArray(userSecurityKey.userId, userIds))
		.groupBy(userSecurityKey.userId);

	return rows.map(row => row.userId);
}

export async function listUserSecurityKeySummariesByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<UserSecurityKeySummary[]> {
	return await db
		.select({
			id: userSecurityKey.id,
			name: userSecurityKey.name,
			lastUsed: userSecurityKey.lastUsed,
		})
		.from(userSecurityKey)
		.where(eq(userSecurityKey.userId, userId));
}

export async function fetchUserSecurityKeyByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: UserSecurityKeyRow['id'],
): Promise<UserSecurityKeyRow | null> {
	const [row] = await db
		.select()
		.from(userSecurityKey)
		.where(eq(userSecurityKey.id, id))
		.limit(1);

	return row ?? null;
}

export async function fetchUserSecurityKeyByIdAndUserIdFromDatabase(
	db: MiDrizzleDatabase,
	id: UserSecurityKeyRow['id'],
	userId: MiUser['id'],
): Promise<UserSecurityKeyRow | null> {
	const [row] = await db
		.select()
		.from(userSecurityKey)
		.where(and(
			eq(userSecurityKey.id, id),
			eq(userSecurityKey.userId, userId),
		))
		.limit(1);

	return row ?? null;
}

export async function createUserSecurityKeyInDatabase(
	db: MiDrizzleDatabase,
	data: UserSecurityKeyInsert,
): Promise<void> {
	await db
		.insert(userSecurityKey)
		.values(data);
}

export async function deleteUserSecurityKeyByIdAndUserIdFromDatabase(
	db: MiDrizzleDatabase,
	id: UserSecurityKeyRow['id'],
	userId: MiUser['id'],
): Promise<void> {
	await db
		.delete(userSecurityKey)
		.where(and(
			eq(userSecurityKey.id, id),
			eq(userSecurityKey.userId, userId),
		));
}

export async function updateUserSecurityKeyNameByIdInDatabase(
	db: MiDrizzleDatabase,
	id: UserSecurityKeyRow['id'],
	name: string,
): Promise<void> {
	await db
		.update(userSecurityKey)
		.set({ name })
		.where(eq(userSecurityKey.id, id));
}

export async function updateUserSecurityKeyPublicKeyByIdAndUserIdInDatabase(
	db: MiDrizzleDatabase,
	id: UserSecurityKeyRow['id'],
	userId: MiUser['id'],
	publicKey: string,
): Promise<void> {
	await db
		.update(userSecurityKey)
		.set({ publicKey })
		.where(and(
			eq(userSecurityKey.id, id),
			eq(userSecurityKey.userId, userId),
		));
}

export async function recordUserSecurityKeyUsageByIdInDatabase(
	db: MiDrizzleDatabase,
	id: UserSecurityKeyRow['id'],
	usage: UserSecurityKeyUsage,
): Promise<void> {
	await db
		.update(userSecurityKey)
		.set(usage)
		.where(eq(userSecurityKey.id, id));
}

export async function recordUserSecurityKeyUsageByIdAndUserIdInDatabase(
	db: MiDrizzleDatabase,
	id: UserSecurityKeyRow['id'],
	userId: MiUser['id'],
	usage: UserSecurityKeyUsage,
): Promise<void> {
	await db
		.update(userSecurityKey)
		.set(usage)
		.where(and(
			eq(userSecurityKey.id, id),
			eq(userSecurityKey.userId, userId),
		));
}
