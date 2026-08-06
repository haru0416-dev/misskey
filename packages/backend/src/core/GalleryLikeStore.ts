/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq, gt, inArray, lt, type SQL } from 'drizzle-orm';
import { galleryLike, type GalleryLikeInsert, type GalleryLikeRow } from '@/db/schema/gallery-like.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiGalleryPost } from '@/models/GalleryPost.js';
import type { MiUser } from '@/models/User.js';

export type GalleryLikeOrder = 'asc' | 'desc';

function galleryLikeCondition(userId: MiUser['id'], postId: MiGalleryPost['id']) {
	return and(eq(galleryLike.userId, userId), eq(galleryLike.postId, postId));
}

function applyGalleryLikePaginationCondition(
	conditions: SQL[],
	sinceId?: string | null,
	untilId?: string | null,
): void {
	if (sinceId && untilId) {
		conditions.push(gt(galleryLike.id, sinceId));
		conditions.push(lt(galleryLike.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(galleryLike.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(galleryLike.id, untilId));
	}
}

export async function galleryLikeExistsInDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	postId: MiGalleryPost['id'],
): Promise<boolean> {
	const [row] = await db
		.select({ id: galleryLike.id })
		.from(galleryLike)
		.where(galleryLikeCondition(userId, postId))
		.limit(1);

	return row != null;
}

export async function fetchGalleryLikeFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	postId: MiGalleryPost['id'],
): Promise<GalleryLikeRow | null> {
	const [row] = await db.select().from(galleryLike).where(galleryLikeCondition(userId, postId)).limit(1);

	return row ?? null;
}

export async function fetchGalleryLikeByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: GalleryLikeRow['id'],
): Promise<GalleryLikeRow> {
	const [row] = await db.select().from(galleryLike).where(eq(galleryLike.id, id)).limit(1);

	if (row == null) {
		throw new Error(`Gallery like ${id} not found`);
	}

	return row;
}

export async function createGalleryLikeInDatabase(db: MiDrizzleDatabase, data: GalleryLikeInsert): Promise<void> {
	await db.insert(galleryLike).values(data);
}

export async function deleteGalleryLikeByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: GalleryLikeRow['id'],
): Promise<void> {
	await db.delete(galleryLike).where(eq(galleryLike.id, id));
}

export async function listLikedGalleryPostIdsByUserIdAndPostIdsFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	postIds: MiGalleryPost['id'][],
): Promise<MiGalleryPost['id'][]> {
	if (postIds.length === 0) return [];

	const rows = await db
		.select({ postId: galleryLike.postId })
		.from(galleryLike)
		.where(and(eq(galleryLike.userId, userId), inArray(galleryLike.postId, postIds)));

	return rows.map((row) => row.postId);
}

export async function listGalleryLikesByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	options: {
		limit: number;
		order: GalleryLikeOrder;
		sinceId?: string | null;
		untilId?: string | null;
	},
): Promise<GalleryLikeRow[]> {
	const conditions: SQL[] = [eq(galleryLike.userId, userId)];

	applyGalleryLikePaginationCondition(conditions, options.sinceId, options.untilId);

	return await db
		.select()
		.from(galleryLike)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(galleryLike.id) : desc(galleryLike.id))
		.limit(options.limit);
}
