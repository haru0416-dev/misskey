/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq, gt, inArray, lt, sql, type SQL } from 'drizzle-orm';
import { galleryPost, type GalleryPostInsert, type GalleryPostRow } from '@/db/schema/gallery-post.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import { MiGalleryPost } from '@/models/GalleryPost.js';
import type { MiUser } from '@/models/User.js';

export type GalleryPostOrder = 'asc' | 'desc';

function deserializeGalleryPost(row: GalleryPostRow): MiGalleryPost {
	return {
		...row,
		user: null,
	} as MiGalleryPost;
}

function applyGalleryPostPaginationCondition(
	conditions: SQL[],
	sinceId?: string | null,
	untilId?: string | null,
): void {
	if (sinceId && untilId) {
		conditions.push(gt(galleryPost.id, sinceId));
		conditions.push(lt(galleryPost.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(galleryPost.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(galleryPost.id, untilId));
	}
}

export function resolveGalleryPostPagination(
	idService: { gen(time?: number): string },
	options: {
		sinceId?: string | null;
		untilId?: string | null;
		sinceDate?: number | null;
		untilDate?: number | null;
	},
): {
	sinceId?: string | null;
	untilId?: string | null;
	order: GalleryPostOrder;
} {
	return resolveDateIdPagination(idService, options);
}

export async function fetchGalleryPostByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiGalleryPost['id'],
): Promise<MiGalleryPost | null> {
	const [row] = await db
		.select()
		.from(galleryPost)
		.where(eq(galleryPost.id, id))
		.limit(1);

	return row == null ? null : deserializeGalleryPost(row);
}

export async function fetchGalleryPostByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: MiGalleryPost['id'],
): Promise<MiGalleryPost> {
	const row = await fetchGalleryPostByIdFromDatabase(db, id);

	if (row == null) {
		throw new EntityNotFoundError(MiGalleryPost, { id });
	}

	return row;
}

export async function createGalleryPostInDatabase(
	db: MiDrizzleDatabase,
	data: GalleryPostInsert,
): Promise<MiGalleryPost> {
	const [row] = await db
		.insert(galleryPost)
		.values(data)
		.returning();

	if (row == null) {
		throw new Error('Failed to create gallery post');
	}

	return deserializeGalleryPost(row);
}

export async function updateGalleryPostByIdAndUserIdInDatabase(
	db: MiDrizzleDatabase,
	id: MiGalleryPost['id'],
	userId: MiUser['id'],
	values: Partial<GalleryPostInsert>,
): Promise<void> {
	await db
		.update(galleryPost)
		.set(values)
		.where(and(
			eq(galleryPost.id, id),
			eq(galleryPost.userId, userId),
		));
}

export async function deleteGalleryPostByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiGalleryPost['id'],
): Promise<void> {
	await db
		.delete(galleryPost)
		.where(eq(galleryPost.id, id));
}

export async function incrementGalleryPostLikedCountInDatabase(
	db: MiDrizzleDatabase,
	id: MiGalleryPost['id'],
): Promise<void> {
	await db
		.update(galleryPost)
		.set({ likedCount: sql`${galleryPost.likedCount} + 1` })
		.where(eq(galleryPost.id, id));
}

export async function decrementGalleryPostLikedCountInDatabase(
	db: MiDrizzleDatabase,
	id: MiGalleryPost['id'],
): Promise<void> {
	await db
		.update(galleryPost)
		.set({ likedCount: sql`${galleryPost.likedCount} - 1` })
		.where(eq(galleryPost.id, id));
}

export async function listGalleryPostsByIdsFromDatabase(
	db: MiDrizzleDatabase,
	ids: MiGalleryPost['id'][],
): Promise<MiGalleryPost[]> {
	if (ids.length === 0) return [];

	const rows = await db
		.select()
		.from(galleryPost)
		.where(inArray(galleryPost.id, ids));

	return rows.map(deserializeGalleryPost);
}

export async function listGalleryPostsWithPaginationFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		userId?: MiUser['id'];
		limit: number;
		order: GalleryPostOrder;
		sinceId?: string | null;
		untilId?: string | null;
	},
): Promise<MiGalleryPost[]> {
	const conditions: SQL[] = [];

	if (options.userId != null) {
		conditions.push(eq(galleryPost.userId, options.userId));
	}

	applyGalleryPostPaginationCondition(conditions, options.sinceId, options.untilId);

	const rows = await db
		.select()
		.from(galleryPost)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(options.order === 'asc' ? asc(galleryPost.id) : desc(galleryPost.id))
		.limit(options.limit);

	return rows.map(deserializeGalleryPost);
}

export async function listPopularGalleryPostsFromDatabase(
	db: MiDrizzleDatabase,
): Promise<MiGalleryPost[]> {
	const rows = await db
		.select()
		.from(galleryPost)
		.where(gt(galleryPost.likedCount, 0))
		.orderBy(desc(galleryPost.likedCount))
		.limit(10);

	return rows.map(deserializeGalleryPost);
}
