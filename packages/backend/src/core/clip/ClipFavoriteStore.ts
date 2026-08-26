/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, count, eq, inArray } from 'drizzle-orm';
import { clipFavorite, type ClipFavoriteInsert, type ClipFavoriteRow } from '@/db/schema/clip-favorite.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiClip } from '@/models/Clip.js';
import type { MiUser } from '@/models/User.js';

function clipFavoriteCondition(userId: MiUser['id'], clipId: MiClip['id']) {
	return and(eq(clipFavorite.userId, userId), eq(clipFavorite.clipId, clipId));
}

export async function clipFavoriteExistsInDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	clipId: MiClip['id'],
): Promise<boolean> {
	const [row] = await db
		.select({ id: clipFavorite.id })
		.from(clipFavorite)
		.where(clipFavoriteCondition(userId, clipId))
		.limit(1);

	return row != null;
}

export async function listFavoritedClipIdsByUserIdAndClipIdsFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	clipIds: MiClip['id'][],
): Promise<MiClip['id'][]> {
	if (clipIds.length === 0) {
		return [];
	}

	const rows = await db
		.select({ clipId: clipFavorite.clipId })
		.from(clipFavorite)
		.where(and(eq(clipFavorite.userId, userId), inArray(clipFavorite.clipId, clipIds)));

	return rows.map((row) => row.clipId);
}

export async function fetchClipFavoriteFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	clipId: MiClip['id'],
): Promise<ClipFavoriteRow | null> {
	const [row] = await db.select().from(clipFavorite).where(clipFavoriteCondition(userId, clipId)).limit(1);

	return row ?? null;
}

export async function createClipFavoriteInDatabase(db: MiDrizzleDatabase, data: ClipFavoriteInsert): Promise<void> {
	await db.insert(clipFavorite).values(data);
}

export async function deleteClipFavoriteByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: ClipFavoriteRow['id'],
): Promise<void> {
	await db.delete(clipFavorite).where(eq(clipFavorite.id, id));
}

export async function countClipFavoritesFromDatabase(db: MiDrizzleDatabase, clipId: MiClip['id']): Promise<number> {
	const [row] = await db.select({ count: count() }).from(clipFavorite).where(eq(clipFavorite.clipId, clipId));

	return row?.count ?? 0;
}

export async function countClipFavoritesByClipIdsFromDatabase(
	db: MiDrizzleDatabase,
	clipIds: MiClip['id'][],
): Promise<Map<MiClip['id'], number>> {
	if (clipIds.length === 0) {
		return new Map();
	}

	const rows = await db
		.select({
			clipId: clipFavorite.clipId,
			count: count(),
		})
		.from(clipFavorite)
		.where(inArray(clipFavorite.clipId, clipIds))
		.groupBy(clipFavorite.clipId);

	return new Map(rows.map((row) => [row.clipId, row.count]));
}

export async function listFavoritedClipIdsByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<MiClip['id'][]> {
	const rows = await db
		.select({ clipId: clipFavorite.clipId })
		.from(clipFavorite)
		.where(eq(clipFavorite.userId, userId));

	return rows.map((row) => row.clipId);
}
