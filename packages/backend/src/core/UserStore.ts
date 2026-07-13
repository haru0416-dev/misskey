/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, ne, or, sql, type SQL } from 'drizzle-orm';
import { user as userTable, type UserInsert, type UserRow } from '@/db/schema/user.js';
import { userProfile, type UserProfileInsert } from '@/db/schema/user-profile.js';
import { userPublickey, type UserPublickeyInsert } from '@/db/schema/user-publickey.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import type { MiLocalUser, MiRemoteUser, MiUser } from '@/models/User.js';

export type UserUpdate = Partial<Omit<UserRow, 'id'>>;
export type UserListSort = '+follower' | '-follower' | '+createdAt' | '-createdAt' | '+updatedAt' | '-updatedAt';
export type UserListState = 'all' | 'alive';
export type UserListOrigin = 'combined' | 'local' | 'remote';
export type AdminUserListSort = UserListSort | '+lastActiveDate' | '-lastActiveDate';
export type AdminUserListState = 'all' | 'alive' | 'available' | 'admin' | 'moderator' | 'adminOrModerator' | 'suspended';

function deserializeNullableDate(value: Date | string | null): Date | null {
	if (value == null) return null;
	if (value instanceof Date) return value;
	return new Date(value);
}

export function deserializeUser(row: UserRow): MiUser {
	const raw = row as UserRow & {
		updatedAt: Date | string | null;
		lastFetchedAt: Date | string | null;
		lastActiveDate: Date | string | null;
		movedAt: Date | string | null;
	};

	return {
		...row,
		updatedAt: deserializeNullableDate(raw.updatedAt),
		lastFetchedAt: deserializeNullableDate(raw.lastFetchedAt),
		lastActiveDate: deserializeNullableDate(raw.lastActiveDate),
		movedAt: deserializeNullableDate(raw.movedAt),
		alsoKnownAs: row.alsoKnownAs == null || row.alsoKnownAs === '' ? null : row.alsoKnownAs.split(','),
		avatar: null,
		banner: null,
	} as MiUser;
}

function userPaginationCondition(options: {
	sinceId?: MiUser['id'] | null;
	untilId?: MiUser['id'] | null;
}): SQL {
	if (options.sinceId && options.untilId) {
		return and(gt(userTable.id, options.sinceId), lt(userTable.id, options.untilId)) ?? sql`TRUE`;
	}

	if (options.sinceId) {
		return gt(userTable.id, options.sinceId);
	}

	if (options.untilId) {
		return lt(userTable.id, options.untilId);
	}

	return sql`TRUE`;
}

function applyMutedAndBlockedUserConditions(conditions: SQL[], meId: MiUser['id']): void {
	conditions.push(sql`${userTable.id} NOT IN (SELECT "muteeId" FROM "muting" WHERE "muterId" = ${meId})`);
	conditions.push(sql`${userTable.id} NOT IN (SELECT "blockeeId" FROM "blocking" WHERE "blockerId" = ${meId})`);
	conditions.push(sql`${userTable.id} NOT IN (SELECT "blockerId" FROM "blocking" WHERE "blockeeId" = ${meId})`);
}

function applyUserListOriginCondition(conditions: SQL[], origin: UserListOrigin): void {
	switch (origin) {
		case 'local':
			conditions.push(isNull(userTable.host));
			break;
		case 'remote':
			conditions.push(isNotNull(userTable.host));
			break;
	}
}

export async function createUserInDatabase(
	db: MiDrizzleDatabase,
	values: UserInsert,
): Promise<MiUser> {
	const [row] = await db
		.insert(userTable)
		.values(values)
		.returning();

	if (row == null) {
		throw new Error('Failed to create user');
	}

	return deserializeUser(row);
}

export async function createUserWithProfileAndPublickeyInDatabase(
	db: MiDrizzleDatabase,
	values: {
		user: UserInsert;
		profile: UserProfileInsert;
		publickey?: UserPublickeyInsert;
	},
): Promise<MiUser> {
	const [row] = await db.transaction(async tx => {
		const created = await tx
			.insert(userTable)
			.values(values.user)
			.returning();

		await tx
			.insert(userProfile)
			.values(values.profile);

		if (values.publickey != null) {
			await tx
				.insert(userPublickey)
				.values(values.publickey);
		}

		return created;
	});

	if (row == null) {
		throw new Error('Failed to create user');
	}

	return deserializeUser(row);
}

export async function isLocalUsernameTaken(db: MiDrizzleDatabase, username: string): Promise<boolean> {
	const [row] = await db
		.select({ id: userTable.id })
		.from(userTable)
		.where(and(
			eq(userTable.usernameLower, username.toLowerCase()),
			isNull(userTable.host),
		))
		.limit(1);

	return row != null;
}

export async function fetchLocalUserByUsernameFromDatabase(db: MiDrizzleDatabase, username: string): Promise<MiLocalUser | null> {
	const user = await fetchUserByUsernameAndHostFromDatabase(db, username, null);

	return user as MiLocalUser | null;
}

export async function fetchUserByUsernameAndHostFromDatabase(
	db: MiDrizzleDatabase,
	username: string,
	host: MiUser['host'],
): Promise<MiUser | null> {
	const [row] = await db
		.select()
		.from(userTable)
		.where(and(
			eq(userTable.usernameLower, username.toLowerCase()),
			host == null ? isNull(userTable.host) : eq(userTable.host, host),
		))
		.limit(1);

	return row ? deserializeUser(row) : null;
}

export async function listUsersByUsernamesAndHostsFromDatabase(
	db: MiDrizzleDatabase,
	queries: readonly { username: string; host: MiUser['host'] }[],
): Promise<MiUser[]> {
	if (queries.length === 0) return [];

	const usernamesByHost = new Map<MiUser['host'], Set<string>>();
	for (const query of queries) {
		const usernames = usernamesByHost.get(query.host) ?? new Set<string>();
		usernames.add(query.username.toLowerCase());
		usernamesByHost.set(query.host, usernames);
	}

	const rows = await db
		.select()
		.from(userTable)
		.where(or(...[...usernamesByHost.entries()].map(([host, usernames]) => and(
			host == null ? isNull(userTable.host) : eq(userTable.host, host),
			inArray(userTable.usernameLower, [...usernames]),
		))));

	return rows.map(row => deserializeUser(row));
}

export async function fetchLocalUserByIdFromDatabase(db: MiDrizzleDatabase, id: MiUser['id']): Promise<MiLocalUser | null> {
	const user = await fetchUserByIdFromDatabase(db, id);

	return user?.host == null ? user as MiLocalUser : null;
}

export async function fetchLocalUserByNativeTokenFromDatabase(
	db: MiDrizzleDatabase,
	token: NonNullable<MiLocalUser['token']>,
): Promise<MiLocalUser | null> {
	const [row] = await db
		.select()
		.from(userTable)
		.where(eq(userTable.token, token))
		.limit(1);

	return row ? deserializeUser(row) as MiLocalUser : null;
}

export async function fetchRemoteUserByIdFromDatabase(db: MiDrizzleDatabase, id: MiUser['id']): Promise<MiRemoteUser | null> {
	const user = await fetchUserByIdFromDatabase(db, id);

	return user?.host != null ? user as MiRemoteUser : null;
}

export async function fetchUserByIdFromDatabase(db: MiDrizzleDatabase, id: MiUser['id']): Promise<MiUser | null> {
	const [row] = await db
		.select()
		.from(userTable)
		.where(eq(userTable.id, id))
		.limit(1);

	return row ? deserializeUser(row) : null;
}

export async function fetchUserByIdOrFailFromDatabase(db: MiDrizzleDatabase, id: MiUser['id']): Promise<MiUser> {
	const user = await fetchUserByIdFromDatabase(db, id);

	if (user == null) {
		throw new EntityNotFoundError('MiUser', { id });
	}

	return user;
}

export async function fetchUserByUriFromDatabase(db: MiDrizzleDatabase, uri: NonNullable<MiUser['uri']>): Promise<MiUser | null> {
	const [row] = await db
		.select()
		.from(userTable)
		.where(eq(userTable.uri, uri))
		.limit(1);

	return row ? deserializeUser(row) : null;
}

export async function countUsersActiveAfterFromDatabase(db: MiDrizzleDatabase, since: Date): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(userTable)
		.where(gt(userTable.lastActiveDate, since));

	return row?.value ?? 0;
}

export async function countUsersByHostFromDatabase(
	db: MiDrizzleDatabase,
	host: MiUser['host'],
): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(userTable)
		.where(host == null ? isNull(userTable.host) : eq(userTable.host, host));

	return row?.value ?? 0;
}

export async function countUsersByHostNotNullFromDatabase(
	db: MiDrizzleDatabase,
): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(userTable)
		.where(isNotNull(userTable.host));

	return row?.value ?? 0;
}

export async function listUsersByIdsFromDatabase(
	db: MiDrizzleDatabase,
	ids: MiUser['id'][],
	options: {
		includeSuspended: boolean;
	},
): Promise<MiUser[]> {
	if (ids.length === 0) return [];

	const conditions: SQL[] = [
		inArray(userTable.id, ids),
	];

	if (!options.includeSuspended) {
		conditions.push(eq(userTable.isSuspended, false));
	}

	const rows = await db
		.select()
		.from(userTable)
		.where(and(...conditions));

	return rows.map(row => deserializeUser(row));
}

export async function listUsersByUrisOrIdsFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		uris: NonNullable<MiUser['uri']>[];
		ids: MiUser['id'][];
	},
): Promise<MiUser[]> {
	const conditions: SQL[] = [];

	if (options.uris.length > 0) {
		conditions.push(inArray(userTable.uri, options.uris));
	}

	if (options.ids.length > 0) {
		conditions.push(inArray(userTable.id, options.ids));
	}

	if (conditions.length === 0) return [];

	const rows = await db
		.select()
		.from(userTable)
		.where(or(...conditions));

	return rows.map(row => deserializeUser(row));
}

export async function listExplorableUsersFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		limit: number;
		offset: number;
		sort?: UserListSort | null;
		state?: UserListState | null;
		origin?: UserListOrigin | null;
		hostname?: MiUser['host'] | null;
		meId?: MiUser['id'] | null;
	},
): Promise<MiUser[]> {
	const conditions: SQL[] = [
		eq(userTable.isExplorable, true),
		eq(userTable.isSuspended, false),
	];

	if ((options.state ?? 'all') === 'alive') {
		conditions.push(gt(userTable.updatedAt, new Date(Date.now() - 1000 * 60 * 60 * 24 * 5)));
	}

	applyUserListOriginCondition(conditions, options.origin ?? 'local');

	if (options.hostname) {
		conditions.push(eq(userTable.host, options.hostname.toLowerCase()));
	}

	let orderBy: SQL = asc(userTable.id);
	switch (options.sort) {
		case '+follower':
			orderBy = desc(userTable.followersCount);
			break;
		case '-follower':
			orderBy = asc(userTable.followersCount);
			break;
		case '+createdAt':
			orderBy = desc(userTable.id);
			break;
		case '-createdAt':
			orderBy = asc(userTable.id);
			break;
		case '+updatedAt':
			conditions.push(isNotNull(userTable.updatedAt));
			orderBy = desc(userTable.updatedAt);
			break;
		case '-updatedAt':
			conditions.push(isNotNull(userTable.updatedAt));
			orderBy = asc(userTable.updatedAt);
			break;
	}

	if (options.meId) {
		applyMutedAndBlockedUserConditions(conditions, options.meId);
	}

	const rows = await db
		.select()
		.from(userTable)
		.where(and(...conditions))
		.orderBy(orderBy)
		.limit(options.limit)
		.offset(options.offset);

	return rows.map(row => deserializeUser(row));
}

export async function listUsersByTagFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		tag: string;
		limit: number;
		offset: number;
		sort: UserListSort;
		state?: UserListState | null;
		origin?: UserListOrigin | null;
	},
): Promise<MiUser[]> {
	const conditions: SQL[] = [
		sql`ARRAY[${options.tag}]::varchar[] <@ ${userTable.tags}`,
		eq(userTable.isSuspended, false),
	];

	if ((options.state ?? 'all') === 'alive') {
		conditions.push(gt(userTable.updatedAt, new Date(Date.now() - 1000 * 60 * 60 * 24 * 5)));
	}

	applyUserListOriginCondition(conditions, options.origin ?? 'local');

	let orderBy: SQL;
	switch (options.sort) {
		case '+follower':
			orderBy = desc(userTable.followersCount);
			break;
		case '-follower':
			orderBy = asc(userTable.followersCount);
			break;
		case '+createdAt':
			orderBy = desc(userTable.id);
			break;
		case '-createdAt':
			orderBy = asc(userTable.id);
			break;
		case '+updatedAt':
			orderBy = desc(userTable.updatedAt);
			break;
		case '-updatedAt':
			orderBy = asc(userTable.updatedAt);
			break;
	}

	const rows = await db
		.select()
		.from(userTable)
		.where(and(...conditions))
		.orderBy(orderBy)
		.limit(options.limit)
		.offset(options.offset);

	return rows.map(row => deserializeUser(row));
}

export async function listRecommendedUsersFromDatabase(
	db: MiDrizzleDatabase,
	meId: MiUser['id'],
	options: {
		limit: number;
		offset: number;
		updatedAfter: Date;
	},
): Promise<MiUser[]> {
	const conditions: SQL[] = [
		eq(userTable.isLocked, false),
		eq(userTable.isExplorable, true),
		eq(userTable.isSuspended, false),
		eq(userTable.isDeleted, false),
		isNull(userTable.host),
		gte(userTable.updatedAt, options.updatedAfter),
		ne(userTable.id, meId),
		sql`${userTable.id} NOT IN (SELECT "followeeId" FROM "following" WHERE "followerId" = ${meId})`,
	];

	applyMutedAndBlockedUserConditions(conditions, meId);

	const rows = await db
		.select()
		.from(userTable)
		.where(and(...conditions))
		.orderBy(desc(userTable.followersCount))
		.limit(options.limit)
		.offset(options.offset);

	return rows.map(row => deserializeUser(row));
}

export async function listAdminUsersFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		limit: number;
		offset: number;
		sort?: AdminUserListSort | null;
		state?: AdminUserListState | null;
		origin?: UserListOrigin | null;
		usernamePrefix?: string | null;
		hostname?: MiUser['host'] | null;
		roleUserIds?: MiUser['id'][] | null;
	},
): Promise<MiUser[]> {
	const conditions: SQL[] = [];

	switch (options.state) {
		case 'available':
			conditions.push(eq(userTable.isSuspended, false));
			break;
		case 'alive':
			conditions.push(gt(userTable.updatedAt, new Date(Date.now() - 1000 * 60 * 60 * 24 * 5)));
			break;
		case 'suspended':
			conditions.push(eq(userTable.isSuspended, true));
			break;
		case 'admin':
		case 'moderator':
		case 'adminOrModerator':
			conditions.push(inArray(userTable.id, options.roleUserIds ?? []));
			break;
	}

	applyUserListOriginCondition(conditions, options.origin ?? 'combined');

	if (options.usernamePrefix) {
		conditions.push(sql`${userTable.usernameLower} LIKE ${options.usernamePrefix}`);
	}

	if (options.hostname) {
		conditions.push(eq(userTable.host, options.hostname.toLowerCase()));
	}

	let orderBy: SQL = asc(userTable.id);
	switch (options.sort) {
		case '+follower':
			orderBy = desc(userTable.followersCount);
			break;
		case '-follower':
			orderBy = asc(userTable.followersCount);
			break;
		case '+createdAt':
			orderBy = desc(userTable.id);
			break;
		case '-createdAt':
			orderBy = asc(userTable.id);
			break;
		case '+updatedAt':
			orderBy = sql`${userTable.updatedAt} DESC NULLS LAST`;
			break;
		case '-updatedAt':
			orderBy = sql`${userTable.updatedAt} ASC NULLS FIRST`;
			break;
		case '+lastActiveDate':
			orderBy = sql`${userTable.lastActiveDate} DESC NULLS LAST`;
			break;
		case '-lastActiveDate':
			orderBy = sql`${userTable.lastActiveDate} ASC NULLS FIRST`;
			break;
	}

	const rows = await db
		.select()
		.from(userTable)
		.where(conditions.length > 0 ? and(...conditions) : sql`TRUE`)
		.orderBy(orderBy)
		.limit(options.limit)
		.offset(options.offset);

	return rows.map(row => deserializeUser(row));
}

export async function listUsersByHostWithPaginationFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		host: NonNullable<MiUser['host']>;
		limit: number;
		sinceId?: MiUser['id'] | null;
		untilId?: MiUser['id'] | null;
	},
): Promise<MiUser[]> {
	const rows = await db
		.select()
		.from(userTable)
		.where(and(
			userPaginationCondition(options),
			eq(userTable.host, options.host),
		))
		.orderBy(options.sinceId && !options.untilId ? asc(userTable.id) : desc(userTable.id))
		.limit(options.limit);

	return rows.map(row => deserializeUser(row));
}

export async function updateUserLastFetchedAtInDatabase(
	db: MiDrizzleDatabase,
	id: MiUser['id'],
	lastFetchedAt: Date,
): Promise<void> {
	await db
		.update(userTable)
		.set({ lastFetchedAt })
		.where(eq(userTable.id, id));
}

export async function updateUserLastActiveDateInDatabase(
	db: MiDrizzleDatabase,
	id: MiUser['id'],
	lastActiveDate: Date,
): Promise<void> {
	await db
		.update(userTable)
		.set({ lastActiveDate })
		.where(eq(userTable.id, id));
}

export async function updateUserLastActiveDateReturningWasHibernatedInDatabase(
	db: MiDrizzleDatabase,
	id: MiUser['id'],
	lastActiveDate: Date,
): Promise<boolean> {
	const [row] = await db
		.update(userTable)
		.set({ lastActiveDate })
		.where(eq(userTable.id, id))
		.returning({ isHibernated: userTable.isHibernated });

	return row?.isHibernated ?? false;
}

export async function updateUserHibernatedStateInDatabase(
	db: MiDrizzleDatabase,
	id: MiUser['id'],
	isHibernated: boolean,
): Promise<void> {
	await db
		.update(userTable)
		.set({ isHibernated })
		.where(eq(userTable.id, id));
}

export async function updateUserDeletedStateInDatabase(
	db: MiDrizzleDatabase,
	id: MiUser['id'],
	isDeleted: boolean,
): Promise<void> {
	await db
		.update(userTable)
		.set({ isDeleted })
		.where(eq(userTable.id, id));
}

export async function updateUserDeletedStateIfNotDeletedInDatabase(
	db: MiDrizzleDatabase,
	id: MiUser['id'],
	isDeleted: boolean,
): Promise<boolean> {
	const rows = await db
		.update(userTable)
		.set({ isDeleted })
		.where(and(
			eq(userTable.id, id),
			eq(userTable.isDeleted, false),
		))
		.returning({ id: userTable.id });

	return rows.length > 0;
}

export async function updateUserSuspendedStateInDatabase(
	db: MiDrizzleDatabase,
	id: MiUser['id'],
	isSuspended: boolean,
): Promise<void> {
	await db
		.update(userTable)
		.set({ isSuspended })
		.where(eq(userTable.id, id));
}

export async function updateUserInDatabase(
	db: MiDrizzleDatabase,
	id: MiUser['id'],
	values: UserUpdate,
): Promise<void> {
	await db
		.update(userTable)
		.set(values)
		.where(eq(userTable.id, id));
}

export async function adjustUserFollowingCountInDatabase(
	db: MiDrizzleDatabase,
	id: MiUser['id'],
	value: number,
): Promise<void> {
	await db
		.update(userTable)
		.set({ followingCount: sql`${userTable.followingCount} + ${value}` })
		.where(eq(userTable.id, id));
}

export async function adjustUserFollowersCountInDatabase(
	db: MiDrizzleDatabase,
	id: MiUser['id'],
	value: number,
): Promise<void> {
	await db
		.update(userTable)
		.set({ followersCount: sql`${userTable.followersCount} + ${value}` })
		.where(eq(userTable.id, id));
}

export async function updateUserIfNotDeletedInDatabase(
	db: MiDrizzleDatabase,
	id: MiUser['id'],
	values: UserUpdate,
): Promise<boolean> {
	const rows = await db
		.update(userTable)
		.set(values)
		.where(and(
			eq(userTable.id, id),
			eq(userTable.isDeleted, false),
		))
		.returning({ id: userTable.id });

	return rows.length > 0;
}

export async function incrementUserNotesCountAndUpdatedAtInDatabase(
	db: MiDrizzleDatabase,
	id: MiUser['id'],
	updatedAt: Date,
): Promise<void> {
	await db
		.update(userTable)
		.set({
			updatedAt,
			notesCount: sql`${userTable.notesCount} + 1`,
		})
		.where(eq(userTable.id, id));
}

export async function listUserIdsByIdsAndLastActiveBeforeFromDatabase(
	db: MiDrizzleDatabase,
	ids: MiUser['id'][],
	before: Date,
): Promise<MiUser['id'][]> {
	if (ids.length === 0) return [];

	const rows = await db
		.select({ id: userTable.id })
		.from(userTable)
		.where(and(
			inArray(userTable.id, ids),
			lt(userTable.lastActiveDate, before),
		));

	return rows.map(row => row.id);
}

export async function updateUsersHibernatedStateInDatabase(
	db: MiDrizzleDatabase,
	ids: MiUser['id'][],
	isHibernated: boolean,
): Promise<void> {
	if (ids.length === 0) return;

	await db
		.update(userTable)
		.set({ isHibernated })
		.where(inArray(userTable.id, ids));
}

export async function decrementUsersFollowingCountInDatabase(
	db: MiDrizzleDatabase,
	ids: MiUser['id'][],
	amount: number,
): Promise<void> {
	if (ids.length === 0) return;

	await db
		.update(userTable)
		.set({ followingCount: sql`${userTable.followingCount} - ${amount}` })
		.where(inArray(userTable.id, ids));
}

export async function decrementUsersFollowersCountInDatabase(
	db: MiDrizzleDatabase,
	ids: MiUser['id'][],
	amount: number,
): Promise<void> {
	if (ids.length === 0) return;

	await db
		.update(userTable)
		.set({ followersCount: sql`${userTable.followersCount} - ${amount}` })
		.where(inArray(userTable.id, ids));
}

export async function deleteUserByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiUser['id'],
): Promise<void> {
	await db
		.delete(userTable)
		.where(eq(userTable.id, id));
}

export async function updateUserUriByUsernameAndHostInDatabase(
	db: MiDrizzleDatabase,
	usernameLower: MiUser['usernameLower'],
	host: NonNullable<MiUser['host']>,
	uri: NonNullable<MiUser['uri']>,
): Promise<void> {
	await db
		.update(userTable)
		.set({ uri })
		.where(and(
			eq(userTable.usernameLower, usernameLower),
			eq(userTable.host, host),
		));
}
