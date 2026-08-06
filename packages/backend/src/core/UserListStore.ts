/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, count, eq, sql } from 'drizzle-orm';
import { userListMembership, type UserListMembershipInsert } from '@/db/schema/user-list-membership.js';
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

	return rows.map((row) => deserializeUserList(row));
}

export async function countUserListsByUserIdFromDatabase(db: MiDrizzleDatabase, userId: MiUser['id']): Promise<number> {
	const [row] = await db.select({ value: count() }).from(userList).where(eq(userList.userId, userId));

	return row?.value ?? 0;
}

export async function fetchUserListByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiUserList['id'],
): Promise<MiUserList | null> {
	const [row] = await db.select().from(userList).where(eq(userList.id, id)).limit(1);

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
		.where(and(eq(userList.id, id), eq(userList.userId, userId)))
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
		.where(and(eq(userList.name, name), eq(userList.userId, userId)))
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
		.where(and(eq(userList.id, id), eq(userList.isPublic, true)))
		.limit(1);

	return row == null ? null : deserializeUserList(row);
}

export async function fetchPublicUserListByIdForShareFromDatabase(
	db: MiDrizzleDatabase,
	id: MiUserList['id'],
): Promise<MiUserList | null> {
	const [row] = await db
		.select()
		.from(userList)
		.where(and(eq(userList.id, id), eq(userList.isPublic, true)))
		.limit(1)
		.for('share');

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
		.where(and(eq(userList.id, id), eq(userList.userId, userId)))
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
		.where(and(eq(userList.id, id), eq(userList.isPublic, true)))
		.limit(1);

	return row != null;
}

export async function createUserListInDatabase(db: MiDrizzleDatabase, values: UserListInsert): Promise<MiUserList> {
	const [row] = await db.insert(userList).values(values).returning();

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
	return await db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('user-list-limit'), hashtext(${values.userId}))`);
		const [existingUser] = await tx
			.select({ id: user.id })
			.from(user)
			.where(eq(user.id, values.userId))
			.limit(1)
			.for('key share');
		if (!existingUser) return null;

		const [row] = await tx.select({ value: count() }).from(userList).where(eq(userList.userId, values.userId));
		if ((row?.value ?? 0) >= limit) return null;

		const [created] = await tx.insert(userList).values(values).returning();
		return created ? deserializeUserList(created) : null;
	});
}

/** Must be called inside a transaction so both owner locks are held until the caller finishes. */
export async function lockUserListOwnerForCreationInDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<boolean> {
	await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext('user-list-limit'), hashtext(${userId}))`);
	const [existingUser] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1)
		.for('key share');
	return existingUser != null;
}

export async function createUserListWithMembershipsWithinLimitsInDatabase(
	db: MiDrizzleDatabase,
	values: UserListInsert,
	memberships: Pick<UserListMembershipInsert, 'id' | 'userId'>[],
	limits: {
		lists: number;
		members: number;
	},
): Promise<{ status: 'created'; userList: MiUserList } | { status: 'tooManyLists' } | { status: 'tooManyMembers' }> {
	return await db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('user-list-limit'), hashtext(${values.userId}))`);
		const [existingUser] = await tx
			.select({ id: user.id })
			.from(user)
			.where(eq(user.id, values.userId))
			.limit(1)
			.for('key share');
		if (!existingUser) return { status: 'tooManyLists' } as const;

		const [row] = await tx.select({ value: count() }).from(userList).where(eq(userList.userId, values.userId));
		if ((row?.value ?? 0) >= limits.lists) return { status: 'tooManyLists' } as const;
		if (memberships.length > limits.members) return { status: 'tooManyMembers' } as const;

		const [created] = await tx.insert(userList).values(values).returning();
		if (created == null) throw new Error('Failed to create user list');

		const membershipRows: UserListMembershipInsert[] = memberships.map((membership) => ({
			...membership,
			userListId: created.id,
			userListUserId: created.userId,
			withReplies: false,
		}));
		const batchSize = 10_000;
		const insertBatch = async (offset: number): Promise<void> => {
			const batch = membershipRows.slice(offset, offset + batchSize);
			if (batch.length === 0) return;

			await tx.insert(userListMembership).values(batch);
			await insertBatch(offset + batchSize);
		};
		await insertBatch(0);

		return { status: 'created', userList: deserializeUserList(created) } as const;
	});
}

export async function updateUserListInDatabase(
	db: MiDrizzleDatabase,
	id: MiUserList['id'],
	values: UserListUpdate,
): Promise<void> {
	await db.update(userList).set(values).where(eq(userList.id, id));
}

export async function deleteUserListByIdInDatabase(db: MiDrizzleDatabase, id: MiUserList['id']): Promise<void> {
	await db.delete(userList).where(eq(userList.id, id));
}
