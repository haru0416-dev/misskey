/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { eq } from 'drizzle-orm';
import { userKeypair, type UserKeypairRow } from '@/db/schema/user-keypair.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiUser } from '@/models/User.js';
import type { MiUserKeypair } from '@/models/UserKeypair.js';

function deserializeUserKeypair(row: UserKeypairRow): MiUserKeypair {
	return {
		...row,
		user: null,
	} as MiUserKeypair;
}

export async function fetchUserKeypairFromDatabase(db: MiDrizzleDatabase, userId: MiUser['id']): Promise<MiUserKeypair> {
	const [row] = await db
		.select()
		.from(userKeypair)
		.where(eq(userKeypair.userId, userId))
		.limit(1);

	if (!row) {
		throw new Error(`User keypair not found: ${userId}`);
	}

	return deserializeUserKeypair(row);
}
