/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, count, eq } from 'drizzle-orm';
import { userList, type UserListInsert, type UserListRow } from '@/db/schema/user-list.js';
import { user } from '@/db/schema/user.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import type { MiUser } from '@/models/User.js';
import type { MiUserList } from '@/models/UserList.js';

type UserListUpdate = Partial<Pick<UserListRow, 'name' | 'isPublic'>>;

function deserializeUserList(row: UserListRow): MiUserList {
	return {
		...row,
		user: null,
	} as MiUserList;
}

export async function listUserListsByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	options: {
		publicOnly?: boolean;
	} = {},
): Promise<MiUserList[]> {
	const conditions = [eq(userList.userId, userId)];
	if (options.publicOnly) {
		conditions.push(eq(userList.isPublic, true));
	}

	const rows = await db
		.select()
		.from(userList)
		.where(and(...conditions));

	return rows.map(row => deserializeUserList(row));
}

export async function countUserListsByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(userList)
		.where(eq(userList.userId, userId));

	return row?.value ?? 0;
}

export async function fetchUserListByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiUserList['id'],
): Promise<MiUserList | null> {
	const [row] = await db
		.select()
		.from(userList)
		.where(eq(userList.id, id))
		.limit(1);

	return row == null ? null : deserializeUserList(row);
}

export async function fetchUserListByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: MiUserList['id'],
): Promise<MiUserList> {
	const found = await fetchUserListByIdFromDatabase(db, id);

	if (found == null) {
		throw new EntityNotFoundError('MiUserList', { id });
	}

	return found;
}

export async function fetchUserListByIdAndUserIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiUserList['id'],
	userId: MiUser['id'],
): Promise<MiUserList | null> {
	const [row] = await db
		.select()
		.from(userList)
		.where(and(
			eq(userList.id, id),
			eq(userList.userId, userId),
		))
		.limit(1);

	return row == null ? null : deserializeUserList(row);
}

export async function fetchUserListByNameAndUserIdFromDatabase(
	db: MiDrizzleDatabase,
	name: MiUserList['name'],
	userId: MiUser['id'],
): Promise<MiUserList | null> {
	const [row] = await db
		.select()
		.from(userList)
		.where(and(
			eq(userList.name, name),
			eq(userList.userId, userId),
		))
		.limit(1);

	return row == null ? null : deserializeUserList(row);
}

export async function fetchPublicUserListByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiUserList['id'],
): Promise<MiUserList | null> {
	const [row] = await db
		.select()
		.from(userList)
		.where(and(
			eq(userList.id, id),
			eq(userList.isPublic, true),
		))
		.limit(1);

	return row == null ? null : deserializeUserList(row);
}

export async function userListExistsByIdAndUserIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiUserList['id'],
	userId: MiUser['id'],
): Promise<boolean> {
	const [row] = await db
		.select({ id: userList.id })
		.from(userList)
		.where(and(
			eq(userList.id, id),
			eq(userList.userId, userId),
		))
		.limit(1);

	return row != null;
}

export async function userListExistsByIdAndPublicFromDatabase(
	db: MiDrizzleDatabase,
	id: MiUserList['id'],
): Promise<boolean> {
	const [row] = await db
		.select({ id: userList.id })
		.from(userList)
		.where(and(
			eq(userList.id, id),
			eq(userList.isPublic, true),
		))
		.limit(1);

	return row != null;
}

export async function createUserListInDatabase(
	db: MiDrizzleDatabase,
	values: UserListInsert,
): Promise<MiUserList> {
	const [row] = await db
		.insert(userList)
		.values(values)
		.returning();

	if (row == null) {
		throw new Error('Failed to create user list');
	}

	return deserializeUserList(row);
}

export async function createUserListWithinLimitInDatabase(
	db: MiDrizzleDatabase,
	values: UserListInsert,
	limit: number,
): Promise<MiUserList | null> {
	return await db.transaction(async tx => {
		const [lockedUser] = await tx
			.select({ id: user.id })
			.from(user)
			.where(eq(user.id, values.userId))
			.limit(1)
			.for('update');
		if (!lockedUser) return null;

		const [row] = await tx
			.select({ value: count() })
			.from(userList)
			.where(eq(userList.userId, values.userId));
		if ((row?.value ?? 0) >= limit) return null;

		const [created] = await tx.insert(userList).values(values).returning();
		return created ? deserializeUserList(created) : null;
	});
}

export async function updateUserListInDatabase(
	db: MiDrizzleDatabase,
	id: MiUserList['id'],
	values: UserListUpdate,
): Promise<void> {
	await db
		.update(userList)
		.set(values)
		.where(eq(userList.id, id));
}

export async function deleteUserListByIdInDatabase(
	db: MiDrizzleDatabase,
	id: MiUserList['id'],
): Promise<void> {
	await db
		.delete(userList)
		.where(eq(userList.id, id));
}
