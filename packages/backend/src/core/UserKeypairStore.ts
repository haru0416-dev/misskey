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

// userKeypair は signup 時に1回作られるのみで、更新・削除する経路が存在しない (不変データ) ため
// invalidation不要な上限付きキャッシュで安全に運用できる。AP配送ジョブ毎の鍵再取得を避けるのが目的。
const MAX_USER_KEYPAIR_CACHE_SIZE = 5000;
const userKeypairCache = new Map<MiUser['id'], MiUserKeypair>();

export async function fetchUserKeypairFromDatabaseCached(db: MiDrizzleDatabase, userId: MiUser['id']): Promise<MiUserKeypair> {
	const cached = userKeypairCache.get(userId);
	if (cached) return cached;

	const keypair = await fetchUserKeypairFromDatabase(db, userId);

	if (userKeypairCache.size >= MAX_USER_KEYPAIR_CACHE_SIZE) {
		const oldestKey = userKeypairCache.keys().next().value;
		if (oldestKey !== undefined) userKeypairCache.delete(oldestKey);
	}
	userKeypairCache.set(userId, keypair);

	return keypair;
}
