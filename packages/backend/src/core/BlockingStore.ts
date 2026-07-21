/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, count, desc, eq, gt, lt, sql, type SQL } from 'drizzle-orm';
import { preparedQueryFor, UNNAMED_PREPARED_STATEMENT } from '@/db/prepared.js';
import { blocking, type BlockingInsert, type BlockingRow } from '@/db/schema/blocking.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import type { MiBlocking } from '@/models/Blocking.js';
import type { MiUser } from '@/models/User.js';

export type BlockingOrder = 'asc' | 'desc';

function deserializeBlocking(row: BlockingRow): MiBlocking {
	return {
		...row,
		blockee: null,
		blocker: null,
	} as MiBlocking;
}

function applyBlockingPaginationCondition(conditions: SQL[], sinceId?: string | null, untilId?: string | null): void {
	if (sinceId && untilId) {
		conditions.push(gt(blocking.id, sinceId));
		conditions.push(lt(blocking.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(blocking.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(blocking.id, untilId));
	}
}

export function resolveBlockingPagination(
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
	order: BlockingOrder;
} {
	return resolveDateIdPagination(idService, options);
}

export async function countBlockingsByBlockerIdFromDatabase(
	db: MiDrizzleDatabase,
	blockerId: MiUser['id'],
): Promise<number> {
	const [row] = await db.select({ value: count() }).from(blocking).where(eq(blocking.blockerId, blockerId));

	return row?.value ?? 0;
}

export async function blockingExistsInDatabase(
	db: MiDrizzleDatabase,
	blockerId: MiUser['id'],
	blockeeId: MiUser['id'],
): Promise<boolean> {
	const [row] = await db
		.select({ id: blocking.id })
		.from(blocking)
		.where(and(eq(blocking.blockerId, blockerId), eq(blocking.blockeeId, blockeeId)))
		.limit(1);

	return row != null;
}

export async function createBlockingInDatabase(db: MiDrizzleDatabase, data: BlockingInsert): Promise<MiBlocking> {
	const [row] = await db.insert(blocking).values(data).returning();

	if (row == null) {
		throw new Error('Failed to create blocking');
	}

	return deserializeBlocking(row);
}

export async function fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(
	db: MiDrizzleDatabase,
	blockerId: MiUser['id'],
	blockeeId: MiUser['id'],
): Promise<MiBlocking | null> {
	const [row] = await db
		.select()
		.from(blocking)
		.where(and(eq(blocking.blockerId, blockerId), eq(blocking.blockeeId, blockeeId)))
		.limit(1);

	return row ? deserializeBlocking(row) : null;
}

export async function deleteBlockingByIdFromDatabase(db: MiDrizzleDatabase, id: MiBlocking['id']): Promise<void> {
	await db.delete(blocking).where(eq(blocking.id, id));
}

async function fetchBlockingByIdOrFailFromDatabase(db: MiDrizzleDatabase, id: MiBlocking['id']): Promise<MiBlocking> {
	const [row] = await db.select().from(blocking).where(eq(blocking.id, id)).limit(1);

	if (row == null) {
		throw new EntityNotFoundError('MiBlocking', { id });
	}

	return deserializeBlocking(row);
}

export async function listBlockingsByBlockerIdFromDatabase(
	db: MiDrizzleDatabase,
	blockerId: MiUser['id'],
	options: {
		limit: number;
		sinceId?: MiBlocking['id'] | null;
	},
): Promise<MiBlocking[]> {
	const conditions = [eq(blocking.blockerId, blockerId)];

	if (options.sinceId) {
		conditions.push(gt(blocking.id, options.sinceId));
	}

	const rows = await db
		.select()
		.from(blocking)
		.where(and(...conditions))
		.orderBy(asc(blocking.id))
		.limit(options.limit);

	return rows.map((row) => deserializeBlocking(row));
}

export async function listBlockingsByBlockerIdWithPaginationFromDatabase(
	db: MiDrizzleDatabase,
	blockerId: MiUser['id'],
	options: {
		limit: number;
		sinceId?: MiBlocking['id'] | null;
		untilId?: MiBlocking['id'] | null;
		order: BlockingOrder;
	},
): Promise<MiBlocking[]> {
	const conditions: SQL[] = [eq(blocking.blockerId, blockerId)];

	applyBlockingPaginationCondition(conditions, options.sinceId, options.untilId);

	const rows = await db
		.select()
		.from(blocking)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(blocking.id) : desc(blocking.id))
		.limit(options.limit);

	return rows.map((row) => deserializeBlocking(row));
}

export async function listBlockeeIdsByBlockerIdFromDatabase(
	db: MiDrizzleDatabase,
	blockerId: MiUser['id'],
): Promise<MiUser['id'][]> {
	const statement = preparedQueryFor(db, 'blocking:blockeeIdsByBlockerId', () =>
		db
			.select({ blockeeId: blocking.blockeeId })
			.from(blocking)
			.where(eq(blocking.blockerId, sql.placeholder('blockerId')))
			.prepare(UNNAMED_PREPARED_STATEMENT),
	);
	const rows = await statement.execute({ blockerId });

	return rows.map((row) => row.blockeeId);
}

export async function listBlockeeIdsByBlockerIdAndBlockeeIdsFromDatabase(
	db: MiDrizzleDatabase,
	blockerId: MiUser['id'],
	blockeeIds: MiUser['id'][],
): Promise<MiUser['id'][]> {
	if (blockeeIds.length === 0) return [];

	const rows = await db
		.select({ blockeeId: blocking.blockeeId })
		.from(blocking)
		.where(and(eq(blocking.blockerId, blockerId), sql`${blocking.blockeeId} = ANY(${sql.param(blockeeIds)})`));

	return rows.map((row) => row.blockeeId);
}

export async function listBlockerIdsByBlockeeIdFromDatabase(
	db: MiDrizzleDatabase,
	blockeeId: MiUser['id'],
): Promise<MiUser['id'][]> {
	const statement = preparedQueryFor(db, 'blocking:blockerIdsByBlockeeId', () =>
		db
			.select({ blockerId: blocking.blockerId })
			.from(blocking)
			.where(eq(blocking.blockeeId, sql.placeholder('blockeeId')))
			.prepare(UNNAMED_PREPARED_STATEMENT),
	);
	const rows = await statement.execute({ blockeeId });

	return rows.map((row) => row.blockerId);
}

export async function listBlockerIdsByBlockeeIdAndBlockerIdsFromDatabase(
	db: MiDrizzleDatabase,
	blockeeId: MiUser['id'],
	blockerIds: MiUser['id'][],
): Promise<MiUser['id'][]> {
	if (blockerIds.length === 0) return [];

	const rows = await db
		.select({ blockerId: blocking.blockerId })
		.from(blocking)
		.where(and(eq(blocking.blockeeId, blockeeId), sql`${blocking.blockerId} = ANY(${sql.param(blockerIds)})`));

	return rows.map((row) => row.blockerId);
}
