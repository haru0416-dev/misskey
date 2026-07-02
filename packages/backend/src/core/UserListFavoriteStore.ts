/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, count, eq } from 'drizzle-orm';
import { userListFavorite, type UserListFavoriteInsert, type UserListFavoriteRow } from '@/db/schema/user-list-favorite.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiUser } from '@/models/User.js';
import type { MiUserList } from '@/models/UserList.js';

function userListFavoriteCondition(userId: MiUser['id'], userListId: MiUserList['id']) {
	return and(
		eq(userListFavorite.userId, userId),
		eq(userListFavorite.userListId, userListId),
	);
}

export async function userListFavoriteExistsInDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	userListId: MiUserList['id'],
): Promise<boolean> {
	const [row] = await db
		.select({ id: userListFavorite.id })
		.from(userListFavorite)
		.where(userListFavoriteCondition(userId, userListId))
		.limit(1);

	return row != null;
}

export async function fetchUserListFavoriteFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	userListId: MiUserList['id'],
): Promise<UserListFavoriteRow | null> {
	const [row] = await db
		.select()
		.from(userListFavorite)
		.where(userListFavoriteCondition(userId, userListId))
		.limit(1);

	return row ?? null;
}

export async function createUserListFavoriteInDatabase(
	db: MiDrizzleDatabase,
	data: UserListFavoriteInsert,
): Promise<void> {
	await db
		.insert(userListFavorite)
		.values(data);
}

export async function deleteUserListFavoriteByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: UserListFavoriteRow['id'],
): Promise<void> {
	await db
		.delete(userListFavorite)
		.where(eq(userListFavorite.id, id));
}

export async function countUserListFavoritesFromDatabase(
	db: MiDrizzleDatabase,
	userListId: MiUserList['id'],
): Promise<number> {
	const [row] = await db
		.select({ count: count() })
		.from(userListFavorite)
		.where(eq(userListFavorite.userListId, userListId));

	return row?.count ?? 0;
}
