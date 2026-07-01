/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { eq } from 'drizzle-orm';
import { userPublickey, type UserPublickeyRow } from '@/db/schema/user-publickey.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiUser } from '@/models/User.js';
import type { MiUserPublickey } from '@/models/UserPublickey.js';

function deserializeUserPublickey(row: UserPublickeyRow): MiUserPublickey {
	return {
		...row,
		user: null,
	} as MiUserPublickey;
}

export async function fetchUserPublickeyByKeyIdFromDatabase(db: MiDrizzleDatabase, keyId: string): Promise<MiUserPublickey | null> {
	const [row] = await db
		.select()
		.from(userPublickey)
		.where(eq(userPublickey.keyId, keyId))
		.limit(1);

	return row ? deserializeUserPublickey(row) : null;
}

export async function fetchUserPublickeyByUserIdFromDatabase(db: MiDrizzleDatabase, userId: MiUser['id']): Promise<MiUserPublickey | null> {
	const [row] = await db
		.select()
		.from(userPublickey)
		.where(eq(userPublickey.userId, userId))
		.limit(1);

	return row ? deserializeUserPublickey(row) : null;
}

export async function updateUserPublickeyInDatabase(db: MiDrizzleDatabase, userId: MiUser['id'], data: Pick<MiUserPublickey, 'keyId' | 'keyPem'>): Promise<void> {
	await db
		.update(userPublickey)
		.set(data)
		.where(eq(userPublickey.userId, userId));
}
