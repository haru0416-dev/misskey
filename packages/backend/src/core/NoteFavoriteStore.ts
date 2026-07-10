/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, count, desc, eq, gt, lt, type SQL } from 'drizzle-orm';
import { noteFavorite, type NoteFavoriteInsert, type NoteFavoriteRow } from '@/db/schema/note-favorite.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';

export type NoteFavoriteOrder = 'asc' | 'desc';

function noteFavoriteCondition(userId: MiUser['id'], noteId: MiNote['id']) {
	return and(
		eq(noteFavorite.userId, userId),
		eq(noteFavorite.noteId, noteId),
	);
}

function applyNoteFavoritePaginationCondition(
	conditions: SQL[],
	sinceId?: string | null,
	untilId?: string | null,
): void {
	if (sinceId && untilId) {
		conditions.push(gt(noteFavorite.id, sinceId));
		conditions.push(lt(noteFavorite.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(noteFavorite.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(noteFavorite.id, untilId));
	}
}

export async function noteFavoriteExistsInDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	noteId: MiNote['id'],
): Promise<boolean> {
	const [row] = await db
		.select({ id: noteFavorite.id })
		.from(noteFavorite)
		.where(noteFavoriteCondition(userId, noteId))
		.limit(1);

	return row != null;
}

export async function fetchNoteFavoriteFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	noteId: MiNote['id'],
): Promise<NoteFavoriteRow | null> {
	const [row] = await db
		.select()
		.from(noteFavorite)
		.where(noteFavoriteCondition(userId, noteId))
		.limit(1);

	return row ?? null;
}

export async function fetchNoteFavoriteByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: NoteFavoriteRow['id'],
): Promise<NoteFavoriteRow> {
	const [row] = await db
		.select()
		.from(noteFavorite)
		.where(eq(noteFavorite.id, id))
		.limit(1);

	if (row == null) {
		throw new Error(`Note favorite ${id} not found`);
	}

	return row;
}

export async function createNoteFavoriteInDatabase(
	db: MiDrizzleDatabase,
	data: NoteFavoriteInsert,
): Promise<void> {
	await db
		.insert(noteFavorite)
		.values(data);
}

export async function deleteNoteFavoriteByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: NoteFavoriteRow['id'],
): Promise<void> {
	await db
		.delete(noteFavorite)
		.where(eq(noteFavorite.id, id));
}

export async function countNoteFavoritesByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<number> {
	const [row] = await db
		.select({ count: count() })
		.from(noteFavorite)
		.where(eq(noteFavorite.userId, userId));

	return row?.count ?? 0;
}

export async function listNoteFavoritesByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	options: {
		limit: number;
		order: NoteFavoriteOrder;
		sinceId?: string | null;
		untilId?: string | null;
	},
): Promise<NoteFavoriteRow[]> {
	const conditions: SQL[] = [
		eq(noteFavorite.userId, userId),
	];

	applyNoteFavoritePaginationCondition(conditions, options.sinceId, options.untilId);

	return await db
		.select()
		.from(noteFavorite)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(noteFavorite.id) : desc(noteFavorite.id))
		.limit(options.limit);
}
