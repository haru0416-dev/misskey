/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import { user as userTable } from '@/db/schema/user.js';
import { userKeypair } from '@/db/schema/user-keypair.js';
import { userProfile } from '@/db/schema/user-profile.js';
import { usedUsername } from '@/db/schema/used-username.js';
import { meta as metaTable } from '@/db/schema/meta.js';
import { deserializeUser } from '@/core/UserStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiUser } from '@/models/User.js';

type SignupAccountInsert = {
	id: MiUser['id'];
	username: MiUser['username'];
	usernameLower: MiUser['username'];
	host: MiUser['host'];
	uri: MiUser['uri'];
	inbox: MiUser['inbox'];
	sharedInbox: MiUser['sharedInbox'];
	followersUri: MiUser['followersUri'];
	token: NonNullable<MiUser['token']>;
	passwordHash: string | null;
	publicKey: string;
	privateKey: string;
	claimRoot: boolean;
};

export class RootUserAlreadyAssignedError extends Error {}
export class DuplicatedUsernameError extends Error {}
export class UsedUsernameError extends Error {}

export async function createSignupAccountInDatabase(db: MiDrizzleDatabase, data: SignupAccountInsert): Promise<{ account: MiUser; rootClaimed: boolean }> {
	const result = await db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`signup:${data.usernameLower}`}))`);

		const [existing] = await tx
			.select({ id: userTable.id })
			.from(userTable)
			.where(and(
				eq(userTable.usernameLower, data.usernameLower),
				isNull(userTable.host),
			))
			.limit(1);

		if (existing) {
			throw new DuplicatedUsernameError();
		}

		const [used] = await tx
			.select({ username: usedUsername.username })
			.from(usedUsername)
			.where(eq(usedUsername.username, data.usernameLower))
			.limit(1);

		if (used) {
			throw new UsedUsernameError();
		}

		const [account] = await tx
			.insert(userTable)
			.values({
				id: data.id,
				username: data.username,
				usernameLower: data.usernameLower,
				host: data.host,
				uri: data.uri,
				inbox: data.inbox,
				sharedInbox: data.sharedInbox,
				followersUri: data.followersUri,
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

		let rootClaimed = false;
		if (data.claimRoot) {
			const [updatedMeta] = await tx
				.update(metaTable)
				.set({ rootUserId: account.id })
				.where(and(eq(metaTable.id, 'x'), isNull(metaTable.rootUserId)))
				.returning({ id: metaTable.id });
			if (!updatedMeta) throw new RootUserAlreadyAssignedError();
			rootClaimed = true;
		}

		return { account, rootClaimed };
	});

	return { account: deserializeUser(result.account), rootClaimed: result.rootClaimed };
}
