/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, count, desc, eq, gt, inArray, lt, type SQL } from 'drizzle-orm';
import { clip, type ClipInsert, type ClipRow } from '@/db/schema/clip.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';
import { MiClip } from '@/models/Clip.js';
import type { MiUser } from '@/models/User.js';

export type ClipOrder = 'asc' | 'desc';

function deserializeClip(row: ClipRow): MiClip {
	return {
		...row,
		user: null,
	} as MiClip;
}

function applyClipPaginationCondition(
	conditions: SQL[],
	sinceId?: string | null,
	untilId?: string | null,
): void {
	if (sinceId && untilId) {
		conditions.push(gt(clip.id, sinceId));
		conditions.push(lt(clip.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(clip.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(clip.id, untilId));
	}
}

export function resolveClipPagination(
	idService: { gen(time?: number): string },
	options: {
		sinceId?: string | null;
		untilId?: string | null;
		sinceDate?: number | null;
		untilDate?: number | null;
	},
): {
	sinceId: string | null;
	untilId: string | null;
	order: ClipOrder;
} {
	return resolveDateIdPagination(idService, options);
}

export async function countClipsByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<number> {
	const [row] = await db
		.select({ count: count() })
		.from(clip)
		.where(eq(clip.userId, userId));

	return row?.count ?? 0;
}

export async function createClipInDatabase(
	db: MiDrizzleDatabase,
	data: ClipInsert,
): Promise<MiClip> {
	const [row] = await db
		.insert(clip)
		.values(data)
		.returning();

	if (row == null) {
		throw new Error('Failed to create clip');
	}

	return deserializeClip(row);
}

export async function fetchClipByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiClip['id'],
): Promise<MiClip | null> {
	const [row] = await db
		.select()
		.from(clip)
		.where(eq(clip.id, id))
		.limit(1);

	return row == null ? null : deserializeClip(row);
}

export async function fetchClipByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: MiClip['id'],
): Promise<MiClip> {
	const row = await fetchClipByIdFromDatabase(db, id);

	if (row == null) {
		throw new EntityNotFoundError(MiClip, { id });
	}

	return row;
}

export async function fetchClipByIdAndUserIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiClip['id'],
	userId: MiUser['id'],
): Promise<MiClip | null> {
	const [row] = await db
		.select()
		.from(clip)
		.where(and(
			eq(clip.id, id),
			eq(clip.userId, userId),
		))
		.limit(1);

	return row == null ? null : deserializeClip(row);
}

export async function updateClipInDatabase(
	db: MiDrizzleDatabase,
	id: MiClip['id'],
	values: Partial<ClipInsert>,
): Promise<void> {
	await db
		.update(clip)
		.set(values)
		.where(eq(clip.id, id));
}

export async function deleteClipInDatabase(
	db: MiDrizzleDatabase,
	id: MiClip['id'],
): Promise<void> {
	await db
		.delete(clip)
		.where(eq(clip.id, id));
}

export async function listClipsByIdsFromDatabase(
	db: MiDrizzleDatabase,
	ids: MiClip['id'][],
	options: {
		isPublic?: boolean;
	} = {},
): Promise<MiClip[]> {
	if (ids.length === 0) return [];

	const conditions = [inArray(clip.id, ids)];
	if (options.isPublic != null) {
		conditions.push(eq(clip.isPublic, options.isPublic));
	}

	const rows = await db
		.select()
		.from(clip)
		.where(and(...conditions));

	return rows.map(deserializeClip);
}

export async function listClipsByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	options: {
		afterId?: MiClip['id'] | null;
		limit?: number;
	} = {},
): Promise<MiClip[]> {
	const conditions = [eq(clip.userId, userId)];
	if (options.afterId) {
		conditions.push(gt(clip.id, options.afterId));
	}

	let query = db
		.select()
		.from(clip)
		.where(and(...conditions))
		.orderBy(asc(clip.id))
		.$dynamic();

	if (options.limit != null) {
		query = query.limit(options.limit);
	}

	const rows = await query;
	return rows.map(deserializeClip);
}

export async function listClipsWithPaginationFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		userId: MiUser['id'];
		isPublic?: boolean;
		limit: number;
		order: ClipOrder;
		sinceId?: string | null;
		untilId?: string | null;
	},
): Promise<MiClip[]> {
	const conditions: SQL[] = [eq(clip.userId, options.userId)];
	applyClipPaginationCondition(conditions, options.sinceId, options.untilId);

	if (options.isPublic != null) {
		conditions.push(eq(clip.isPublic, options.isPublic));
	}

	const rows = await db
		.select()
		.from(clip)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(clip.id) : desc(clip.id))
		.limit(options.limit);

	return rows.map(deserializeClip);
}
