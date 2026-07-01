/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq, gt, lt, or, sql, type SQL } from 'drizzle-orm';
import { EntityNotFoundError } from 'typeorm';
import { flash, type FlashInsert, type FlashRow } from '@/db/schema/flash.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { MiFlash, type FlashVisibility } from '@/models/Flash.js';
import type { MiUser } from '@/models/User.js';

export type FlashOrder = 'asc' | 'desc';

function deserializeFlash(row: FlashRow): MiFlash {
	return {
		...row,
		user: null,
	} as MiFlash;
}

function applyFlashPaginationCondition(
	conditions: SQL[],
	sinceId?: string | null,
	untilId?: string | null,
): void {
	if (sinceId && untilId) {
		conditions.push(gt(flash.id, sinceId));
		conditions.push(lt(flash.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(flash.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(flash.id, untilId));
	}
}

function applyFlashSearchCondition(
	conditions: SQL[],
	searchQuery?: string | null,
): void {
	if (searchQuery == null) {
		return;
	}

	for (const word of searchQuery.trim().split(' ')) {
		const escaped = `%${sqlLikeEscape(word)}%`;
		const condition = or(
			sql`${flash.title} ILIKE ${escaped}`,
			sql`${flash.summary} ILIKE ${escaped}`,
		);
		if (condition != null) {
			conditions.push(condition);
		}
	}
}

export function resolveFlashPagination(
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
	order: FlashOrder;
} {
	if (options.sinceId && options.untilId) {
		return { sinceId: options.sinceId, untilId: options.untilId, order: 'desc' };
	} else if (options.sinceId) {
		return { sinceId: options.sinceId, untilId: null, order: 'asc' };
	} else if (options.untilId) {
		return { sinceId: null, untilId: options.untilId, order: 'desc' };
	} else if (options.sinceDate && options.untilDate) {
		return { sinceId: idService.gen(options.sinceDate), untilId: idService.gen(options.untilDate), order: 'desc' };
	} else if (options.sinceDate) {
		return { sinceId: idService.gen(options.sinceDate), untilId: null, order: 'asc' };
	} else if (options.untilDate) {
		return { sinceId: null, untilId: idService.gen(options.untilDate), order: 'desc' };
	} else {
		return { sinceId: null, untilId: null, order: 'desc' };
	}
}

export async function fetchFlashByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiFlash['id'],
): Promise<MiFlash | null> {
	const [row] = await db
		.select()
		.from(flash)
		.where(eq(flash.id, id))
		.limit(1);

	return row == null ? null : deserializeFlash(row);
}

export async function fetchFlashByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: MiFlash['id'],
): Promise<MiFlash> {
	const row = await fetchFlashByIdFromDatabase(db, id);

	if (row == null) {
		throw new EntityNotFoundError(MiFlash, { id });
	}

	return row;
}

export async function createFlashInDatabase(
	db: MiDrizzleDatabase,
	data: FlashInsert,
): Promise<MiFlash> {
	const [row] = await db
		.insert(flash)
		.values(data)
		.returning();

	if (row == null) {
		throw new Error('Failed to create flash');
	}

	return deserializeFlash(row);
}

export async function updateFlashInDatabase(
	db: MiDrizzleDatabase,
	id: MiFlash['id'],
	values: Partial<FlashInsert>,
): Promise<void> {
	await db
		.update(flash)
		.set(values)
		.where(eq(flash.id, id));
}

export async function deleteFlashInDatabase(
	db: MiDrizzleDatabase,
	id: MiFlash['id'],
): Promise<void> {
	await db
		.delete(flash)
		.where(eq(flash.id, id));
}

export async function incrementFlashLikedCountInDatabase(
	db: MiDrizzleDatabase,
	id: MiFlash['id'],
): Promise<void> {
	await db
		.update(flash)
		.set({ likedCount: sql`${flash.likedCount} + 1` })
		.where(eq(flash.id, id));
}

export async function decrementFlashLikedCountInDatabase(
	db: MiDrizzleDatabase,
	id: MiFlash['id'],
): Promise<void> {
	await db
		.update(flash)
		.set({ likedCount: sql`${flash.likedCount} - 1` })
		.where(eq(flash.id, id));
}

export async function listFlashsWithPaginationFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		userId?: MiUser['id'];
		visibility?: FlashVisibility;
		searchQuery?: string | null;
		limit?: number;
		order: FlashOrder;
		sinceId?: string | null;
		untilId?: string | null;
	},
): Promise<MiFlash[]> {
	const conditions: SQL[] = [];

	if (options.userId != null) {
		conditions.push(eq(flash.userId, options.userId));
	}
	if (options.visibility != null) {
		conditions.push(eq(flash.visibility, options.visibility));
	}

	applyFlashPaginationCondition(conditions, options.sinceId, options.untilId);
	applyFlashSearchCondition(conditions, options.searchQuery);

	let query = db
		.select()
		.from(flash)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(options.order === 'asc' ? asc(flash.id) : desc(flash.id))
		.$dynamic();

	if (options.limit != null) {
		query = query.limit(options.limit);
	}

	const rows = await query;
	return rows.map(deserializeFlash);
}

export async function listFeaturedFlashsFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		offset?: number;
		limit: number;
	},
): Promise<MiFlash[]> {
	let query = db
		.select()
		.from(flash)
		.where(and(
			gt(flash.likedCount, 0),
			eq(flash.visibility, 'public'),
		))
		.orderBy(desc(flash.likedCount), desc(flash.updatedAt), desc(flash.id))
		.limit(options.limit)
		.$dynamic();

	if (options.offset) {
		query = query.offset(options.offset);
	}

	const rows = await query;
	return rows.map(deserializeFlash);
}
