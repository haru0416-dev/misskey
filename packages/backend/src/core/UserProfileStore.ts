/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, count, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { userProfile, type UserProfileInsert, type UserProfileRow } from '@/db/schema/user-profile.js';
import { userSecurityKey } from '@/db/schema/user-security-key.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import type { MiUser } from '@/models/User.js';

export type UserProfileUpdate = Partial<Omit<UserProfileRow, 'userId'>>;

export function deserializeUserProfile(row: UserProfileRow): MiUserProfile {
	return {
		...row,
		user: null,
		pinnedPage: null,
	} as MiUserProfile;
}

export async function createUserProfileInDatabase(
	db: MiDrizzleDatabase,
	data: UserProfileInsert,
): Promise<MiUserProfile> {
	const [row] = await db
		.insert(userProfile)
		.values(data)
		.returning();

	if (row == null) {
		throw new Error('Failed to create user profile');
	}

	return deserializeUserProfile(row);
}

export async function fetchUserProfileByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<MiUserProfile | null> {
	const [row] = await db
		.select()
		.from(userProfile)
		.where(eq(userProfile.userId, userId))
		.limit(1);

	return row ? deserializeUserProfile(row) : null;
}

export async function fetchUserProfileByUserIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<MiUserProfile> {
	const row = await fetchUserProfileByUserIdFromDatabase(db, userId);

	if (row == null) {
		throw new EntityNotFoundError(MiUserProfile, { userId });
	}

	return row;
}

export async function fetchUserProfileByEmailFromDatabase(
	db: MiDrizzleDatabase,
	email: NonNullable<MiUserProfile['email']>,
): Promise<MiUserProfile | null> {
	const [row] = await db
		.select()
		.from(userProfile)
		.where(eq(userProfile.email, email))
		.limit(1);

	return row ? deserializeUserProfile(row) : null;
}

export async function countVerifiedUserProfilesByEmailFromDatabase(
	db: MiDrizzleDatabase,
	email: NonNullable<MiUserProfile['email']>,
): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(userProfile)
		.where(and(
			eq(userProfile.emailVerified, true),
			eq(userProfile.email, email),
		));

	return row?.value ?? 0;
}

export async function fetchUserProfileByEmailVerifyCodeFromDatabase(
	db: MiDrizzleDatabase,
	emailVerifyCode: NonNullable<MiUserProfile['emailVerifyCode']>,
): Promise<MiUserProfile | null> {
	const [row] = await db
		.select()
		.from(userProfile)
		.where(eq(userProfile.emailVerifyCode, emailVerifyCode))
		.limit(1);

	return row ? deserializeUserProfile(row) : null;
}

export async function listUserProfilesByUserIdsFromDatabase(
	db: MiDrizzleDatabase,
	userIds: MiUser['id'][],
): Promise<MiUserProfile[]> {
	if (userIds.length === 0) return [];

	const rows = await db
		.select()
		.from(userProfile)
		.where(inArray(userProfile.userId, userIds));

	return rows.map(row => deserializeUserProfile(row));
}

export async function updateUserProfileInDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	data: UserProfileUpdate,
): Promise<void> {
	await db
		.update(userProfile)
		.set(data)
		.where(eq(userProfile.userId, userId));
}

export async function appendVerifiedLinkToUserProfileInDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	url: string,
): Promise<void> {
	await db
		.update(userProfile)
		.set({
			verifiedLinks: sql`array_append(${userProfile.verifiedLinks}, ${url})`,
		})
		.where(eq(userProfile.userId, userId));
}

type BirthdayDateCondition =
	| { type: 'single'; value: number }
	| { type: 'range'; begin: number; end: number };

function birthdayDateConditionSql(condition: BirthdayDateCondition): SQL {
	if (condition.type === 'single') {
		return sql`get_birthday_date("followeeProfile"."birthday") BETWEEN ${condition.value} AND ${condition.value}`;
	}

	if (condition.begin <= condition.end) {
		return sql`get_birthday_date("followeeProfile"."birthday") BETWEEN ${condition.begin} AND ${condition.end}`;
	}

	return sql`(
		get_birthday_date("followeeProfile"."birthday") BETWEEN ${condition.begin} AND 1231
		OR get_birthday_date("followeeProfile"."birthday") BETWEEN 101 AND ${condition.end}
	)`;
}

export async function listFollowingUsersByBirthdayDateFromDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
	condition: BirthdayDateCondition,
	options: {
		limit: number;
		offset: number;
	},
): Promise<{ userId: MiUser['id']; birthdayDate: number }[]> {
	const result = await db.execute<{ user_id: MiUser['id']; birthday_date: string | number }>(sql`
		SELECT "following"."followeeId" AS "user_id",
			get_birthday_date("followeeProfile"."birthday") AS "birthday_date"
		FROM "following"
		INNER JOIN "user_profile" AS "followeeProfile" ON "followeeProfile"."userId" = "following"."followeeId"
		WHERE "following"."followerId" = ${followerId}
			AND ${birthdayDateConditionSql(condition)}
		ORDER BY "birthday_date" ASC
		OFFSET ${options.offset}
		LIMIT ${options.limit}
	`);

	return result.rows.map(row => ({
		userId: row.user_id,
		birthdayDate: Number(row.birthday_date),
	}));
}

export async function unsetUserMfaInDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<void> {
	await db.transaction(async tx => {
		await tx
			.delete(userSecurityKey)
			.where(eq(userSecurityKey.userId, userId));

		await tx
			.update(userProfile)
			.set({
				twoFactorSecret: null,
				twoFactorBackupSecret: null,
				twoFactorEnabled: false,
				usePasswordLessLogin: false,
			})
			.where(eq(userProfile.userId, userId));
	});
}
