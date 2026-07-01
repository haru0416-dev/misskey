/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, eq, isNull } from 'drizzle-orm';
import { user as userTable, type UserRow } from '@/db/schema/user.js';
import { userKeypair } from '@/db/schema/user-keypair.js';
import { userProfile } from '@/db/schema/user-profile.js';
import { usedUsername } from '@/db/schema/used-username.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiUser } from '@/models/User.js';

type SignupAccountInsert = {
	id: MiUser['id'];
	username: MiUser['username'];
	usernameLower: MiUser['username'];
	host: MiUser['host'];
	token: NonNullable<MiUser['token']>;
	passwordHash: string | null;
	publicKey: string;
	privateKey: string;
};

function deserializeUser(row: UserRow): MiUser {
	return {
		...row,
		alsoKnownAs: row.alsoKnownAs == null || row.alsoKnownAs === '' ? null : row.alsoKnownAs.split(','),
		avatar: null,
		banner: null,
	} as MiUser;
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

export async function createSignupAccountInDatabase(db: MiDrizzleDatabase, data: SignupAccountInsert): Promise<MiUser> {
	const row = await db.transaction(async (tx) => {
		const [existing] = await tx
			.select({ id: userTable.id })
			.from(userTable)
			.where(and(
				eq(userTable.usernameLower, data.usernameLower),
				isNull(userTable.host),
			))
			.limit(1);

		if (existing) {
			throw new Error('DUPLICATED_USERNAME');
		}

		const [account] = await tx
			.insert(userTable)
			.values({
				id: data.id,
				username: data.username,
				usernameLower: data.usernameLower,
				host: data.host,
				token: data.token,
			})
			.returning();

		if (!account) {
			throw new Error('User row was not created');
		}

		await tx.insert(userKeypair).values({
			userId: account.id,
			publicKey: data.publicKey,
			privateKey: data.privateKey,
		});

		await tx.insert(userProfile).values({
			userId: account.id,
			autoAcceptFollowed: true,
			password: data.passwordHash,
		});

		await tx.insert(usedUsername).values({
			username: data.usernameLower,
			createdAt: new Date(),
		});

		return account;
	});

	return deserializeUser(row);
}
