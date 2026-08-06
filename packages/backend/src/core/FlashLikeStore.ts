/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq, gt, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import { flash } from '@/db/schema/flash.js';
import { flashLike, type FlashLikeInsert, type FlashLikeRow } from '@/db/schema/flash-like.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import type { MiFlash } from '@/models/Flash.js';
import type { MiUser } from '@/models/User.js';

export type FlashLikeOrder = 'asc' | 'desc';

export type FlashLikeWithFlash = FlashLikeRow & {
	flash: MiFlash;
};

function flashLikeCondition(userId: MiUser['id'], flashId: MiFlash['id']) {
	return and(eq(flashLike.userId, userId), eq(flashLike.flashId, flashId));
}

function applyFlashLikePaginationCondition(conditions: SQL[], sinceId?: string | null, untilId?: string | null): void {
	if (sinceId && untilId) {
		conditions.push(gt(flashLike.id, sinceId));
		conditions.push(lt(flashLike.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(flashLike.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(flashLike.id, untilId));
	}
}

function applyFlashSearchCondition(conditions: SQL[], search?: string | null): void {
	if (search == null) {
		return;
	}

	for (const word of search.trim().split(' ')) {
		const escaped = `%${sqlLikeEscape(word)}%`;
		const condition = or(sql`${flash.title} ILIKE ${escaped}`, sql`${flash.summary} ILIKE ${escaped}`);
		if (condition != null) {
			conditions.push(condition);
		}
	}
}

export async function flashLikeExistsInDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	flashId: MiFlash['id'],
): Promise<boolean> {
	const [row] = await db
		.select({ id: flashLike.id })
		.from(flashLike)
		.where(flashLikeCondition(userId, flashId))
		.limit(1);

	return row != null;
}

export async function fetchFlashLikeFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	flashId: MiFlash['id'],
): Promise<FlashLikeRow | null> {
	const [row] = await db.select().from(flashLike).where(flashLikeCondition(userId, flashId)).limit(1);

	return row ?? null;
}

export async function fetchFlashLikeByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: FlashLikeRow['id'],
): Promise<FlashLikeRow> {
	const [row] = await db.select().from(flashLike).where(eq(flashLike.id, id)).limit(1);

	if (row == null) {
		throw new Error(`Flash like ${id} not found`);
	}

	return row;
}

export async function createFlashLikeInDatabase(db: MiDrizzleDatabase, data: FlashLikeInsert): Promise<void> {
	await db.insert(flashLike).values(data);
}

export async function deleteFlashLikeByIdFromDatabase(db: MiDrizzleDatabase, id: FlashLikeRow['id']): Promise<boolean> {
	const deleted = await db.delete(flashLike).where(eq(flashLike.id, id)).returning({ id: flashLike.id });
	return deleted.length === 1;
}

export async function listLikedFlashIdsByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<MiFlash['id'][]> {
	const rows = await db.select({ flashId: flashLike.flashId }).from(flashLike).where(eq(flashLike.userId, userId));

	return rows.map((row) => row.flashId);
}

export async function listLikedFlashIdsByUserIdAndFlashIdsFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	flashIds: MiFlash['id'][],
): Promise<MiFlash['id'][]> {
	if (flashIds.length === 0) return [];

	const rows = await db
		.select({ flashId: flashLike.flashId })
		.from(flashLike)
		.where(and(eq(flashLike.userId, userId), inArray(flashLike.flashId, flashIds)));

	return rows.map((row) => row.flashId);
}

export async function listFlashLikesByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	options: {
		limit: number;
		order: FlashLikeOrder;
		sinceId?: string | null;
		untilId?: string | null;
		search?: string | null;
	},
): Promise<FlashLikeWithFlash[]> {
	const conditions: SQL[] = [eq(flashLike.userId, userId)];

	applyFlashLikePaginationCondition(conditions, options.sinceId, options.untilId);
	applyFlashSearchCondition(conditions, options.search);

	const rows = await db
		.select({
			like: flashLike,
			flash,
		})
		.from(flashLike)
		.innerJoin(flash, eq(flashLike.flashId, flash.id))
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(flashLike.id) : desc(flashLike.id))
		.limit(options.limit);

	return rows.map((row) => ({
		...row.like,
		flash: row.flash as MiFlash,
	}));
}
