/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { eq } from 'drizzle-orm';
import { userKeypair } from '@/db/schema/user-keypair.js';
import type { UserKeypairRow } from '@/db/schema/user-keypair.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiUser } from '@/models/User.js';
import type { MiUserKeypair } from '@/models/UserKeypair.js';

function deserializeUserKeypair(row: UserKeypairRow): MiUserKeypair {
	return {
		...row,
		user: null,
	} as MiUserKeypair;
}

async function fetchUserKeypairFromDatabase(db: MiDrizzleDatabase, userId: MiUser['id']): Promise<MiUserKeypair> {
	const [row] = await db.select().from(userKeypair).where(eq(userKeypair.userId, userId)).limit(1);

	if (!row) {
		throw new Error(`User keypair not found: ${userId}`);
	}

	return deserializeUserKeypair(row);
}

// 作成後の鍵を更新する経路はないため、AP 配送で再利用する。ユーザー削除時は DB の cascade で消えるが、
// このキャッシュには残るため、保持件数に上限を設ける。
const MAX_USER_KEYPAIR_CACHE_SIZE = 5000;
const userKeypairCache = new Map<MiUser['id'], MiUserKeypair>();

export async function fetchUserKeypairFromDatabaseCached(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<MiUserKeypair> {
	const cached = userKeypairCache.get(userId);
	if (cached) {
		return cached;
	}

	const keypair = await fetchUserKeypairFromDatabase(db, userId);

	if (userKeypairCache.size >= MAX_USER_KEYPAIR_CACHE_SIZE) {
		const oldestKey = userKeypairCache.keys().next().value;
		if (oldestKey !== undefined) {
			userKeypairCache.delete(oldestKey);
		}
	}
	userKeypairCache.set(userId, keypair);

	return keypair;
}
