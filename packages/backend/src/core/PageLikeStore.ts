/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq, gt, inArray, lt, type SQL } from 'drizzle-orm';
import { pageLike, type PageLikeInsert, type PageLikeRow } from '@/db/schema/page-like.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiPage } from '@/models/Page.js';
import type { MiUser } from '@/models/User.js';

export type PageLikeOrder = 'asc' | 'desc';

function pageLikeCondition(userId: MiUser['id'], pageId: MiPage['id']) {
	return and(
		eq(pageLike.userId, userId),
		eq(pageLike.pageId, pageId),
	);
}

function applyPageLikePaginationCondition(
	conditions: SQL[],
	sinceId?: string | null,
	untilId?: string | null,
): void {
	if (sinceId && untilId) {
		conditions.push(gt(pageLike.id, sinceId));
		conditions.push(lt(pageLike.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(pageLike.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(pageLike.id, untilId));
	}
}

export async function pageLikeExistsInDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	pageId: MiPage['id'],
): Promise<boolean> {
	const [row] = await db
		.select({ id: pageLike.id })
		.from(pageLike)
		.where(pageLikeCondition(userId, pageId))
		.limit(1);

	return row != null;
}

export async function fetchPageLikeFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	pageId: MiPage['id'],
): Promise<PageLikeRow | null> {
	const [row] = await db
		.select()
		.from(pageLike)
		.where(pageLikeCondition(userId, pageId))
		.limit(1);

	return row ?? null;
}

export async function fetchPageLikeByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: PageLikeRow['id'],
): Promise<PageLikeRow> {
	const [row] = await db
		.select()
		.from(pageLike)
		.where(eq(pageLike.id, id))
		.limit(1);

	if (row == null) {
		throw new Error(`Page like ${id} not found`);
	}

	return row;
}

export async function createPageLikeInDatabase(
	db: MiDrizzleDatabase,
	data: PageLikeInsert,
): Promise<void> {
	await db
		.insert(pageLike)
		.values(data);
}

export async function deletePageLikeByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: PageLikeRow['id'],
): Promise<void> {
	await db
		.delete(pageLike)
		.where(eq(pageLike.id, id));
}

export async function listLikedPageIdsByUserIdAndPageIdsFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	pageIds: MiPage['id'][],
): Promise<MiPage['id'][]> {
	if (pageIds.length === 0) return [];

	const rows = await db
		.select({ pageId: pageLike.pageId })
		.from(pageLike)
		.where(and(
			eq(pageLike.userId, userId),
			inArray(pageLike.pageId, pageIds),
		));

	return rows.map(row => row.pageId);
}

export async function listPageLikesByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	options: {
		limit: number;
		order: PageLikeOrder;
		sinceId?: string | null;
		untilId?: string | null;
	},
): Promise<PageLikeRow[]> {
	const conditions: SQL[] = [
		eq(pageLike.userId, userId),
	];

	applyPageLikePaginationCondition(conditions, options.sinceId, options.untilId);

	return await db
		.select()
		.from(pageLike)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(pageLike.id) : desc(pageLike.id))
		.limit(options.limit);
}
