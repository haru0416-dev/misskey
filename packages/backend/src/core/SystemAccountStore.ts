/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import { systemAccount as systemAccountTable } from '@/db/schema/system-account.js';
import { user as userTable } from '@/db/schema/user.js';
import { userKeypair } from '@/db/schema/user-keypair.js';
import { userProfile } from '@/db/schema/user-profile.js';
import { usedUsername } from '@/db/schema/used-username.js';
import { deserializeUser } from '@/core/UserStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import type { MiSystemAccount } from '@/models/SystemAccount.js';

type SystemAccountCreateData = {
	id: MiUser['id'];
	type: string;
	username: MiUser['username'];
	usernameLower: MiUser['username'];
	name: MiUser['name'];
	token: NonNullable<MiUser['token']>;
	passwordHash: string;
	publicKey: string;
	privateKey: string;
};

type SystemAccountProfileUpdateData = {
	userId: MiUser['id'];
	name?: MiUser['name'];
	description?: MiUserProfile['description'];
};

async function listSystemAccountsFromDatabase(db: MiDrizzleDatabase): Promise<MiSystemAccount[]> {
	const rows = await db.select().from(systemAccountTable);

	return rows.map(
		(row) =>
			({
				...row,
				user: null,
			}) as MiSystemAccount,
	);
}

export async function fetchSystemAccountUserFromDatabase(
	db: MiDrizzleDatabase,
	type: string,
): Promise<MiLocalUser | null> {
	const [row] = await db
		.select({ user: userTable })
		.from(systemAccountTable)
		.innerJoin(userTable, eq(systemAccountTable.userId, userTable.id))
		.where(eq(systemAccountTable.type, type))
		.limit(1);

	return row ? (deserializeUser(row.user) as MiLocalUser) : null;
}

export async function createOrFetchSystemAccountInDatabase(
	db: MiDrizzleDatabase,
	data: SystemAccountCreateData,
): Promise<MiLocalUser> {
	const account = await db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`system-account:${data.type}`}))`);

		const [existingSystemAccount] = await tx
			.select({ user: userTable })
			.from(systemAccountTable)
			.innerJoin(userTable, eq(systemAccountTable.userId, userTable.id))
			.where(eq(systemAccountTable.type, data.type))
			.limit(1);

		if (existingSystemAccount) {
			return existingSystemAccount.user;
		}

		const [existingUser] = await tx
			.select()
			.from(userTable)
			.where(and(eq(userTable.usernameLower, data.usernameLower), isNull(userTable.host)))
			.limit(1);

		let account = existingUser;
		if (account == null) {
			const [created] = await tx
				.insert(userTable)
				.values({
					id: data.id,
					username: data.username,
					usernameLower: data.usernameLower,
					host: null,
					token: data.token,
					isLocked: true,
					isExplorable: false,
					isBot: true,
					name: data.name,
				})
				.returning();
			if (created == null) throw new Error('User row was not created');
			account = created;
		}

		if (!existingUser) {
			await tx.insert(userKeypair).values({
				publicKey: data.publicKey,
				privateKey: data.privateKey,
				userId: account.id,
			});

			await tx.insert(userProfile).values({
				userId: account.id,
				autoAcceptFollowed: false,
				password: data.passwordHash,
			});

			await tx
				.insert(usedUsername)
				.values({
					createdAt: new Date(),
					username: data.usernameLower,
				})
				.onConflictDoUpdate({
					target: usedUsername.username,
					set: {
						createdAt: new Date(),
					},
				});
		}

		await tx
			.insert(systemAccountTable)
			.values({
				id: account.id,
				userId: account.id,
				type: data.type,
			})
			.onConflictDoUpdate({
				target: systemAccountTable.type,
				set: {
					id: account.id,
					userId: account.id,
				},
			});

		return account;
	});

	return deserializeUser(account) as MiLocalUser;
}

export async function updateSystemAccountUserInDatabase(
	db: MiDrizzleDatabase,
	data: SystemAccountProfileUpdateData,
): Promise<MiLocalUser> {
	const user = await db.transaction(async (tx) => {
		if (data.name !== undefined) {
			await tx.update(userTable).set({ name: data.name }).where(eq(userTable.id, data.userId));
		}

		if (data.description !== undefined) {
			await tx.update(userProfile).set({ description: data.description }).where(eq(userProfile.userId, data.userId));
		}

		const [updated] = await tx.select().from(userTable).where(eq(userTable.id, data.userId)).limit(1);

		if (!updated) {
			throw new Error('System account user was not found after update');
		}

		return updated;
	});

	return deserializeUser(user) as MiLocalUser;
}
