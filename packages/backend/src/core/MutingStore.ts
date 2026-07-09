/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { muting, type MutingInsert, type MutingRow } from '@/db/schema/muting.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import type { MiMuting } from '@/models/Muting.js';
import type { MiUser } from '@/models/User.js';

export type MutingOrder = 'asc' | 'desc';

function deserializeMuting(row: MutingRow): MiMuting {
	return {
		...row,
		mutee: null,
		muter: null,
	} as MiMuting;
}

function applyMutingPaginationCondition(
	conditions: SQL[],
	sinceId?: string | null,
	untilId?: string | null,
): void {
	if (sinceId && untilId) {
		conditions.push(gt(muting.id, sinceId));
		conditions.push(lt(muting.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(muting.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(muting.id, untilId));
	}
}

export function resolveMutingPagination(
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
	order: MutingOrder;
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

export async function countMutingsByMuterIdFromDatabase(
	db: MiDrizzleDatabase,
	muterId: MiUser['id'],
): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(muting)
		.where(eq(muting.muterId, muterId));

	return row?.value ?? 0;
}

export async function mutingExistsInDatabase(
	db: MiDrizzleDatabase,
	muterId: MiUser['id'],
	muteeId: MiUser['id'],
): Promise<boolean> {
	const [row] = await db
		.select({ id: muting.id })
		.from(muting)
		.where(and(
			eq(muting.muterId, muterId),
			eq(muting.muteeId, muteeId),
		))
		.limit(1);

	return row != null;
}

export async function listMuterIdsByMuteeIdAndMuterIdsFromDatabase(
	db: MiDrizzleDatabase,
	muteeId: MiUser['id'],
	muterIds: MiUser['id'][],
): Promise<MiUser['id'][]> {
	if (muterIds.length === 0) return [];

	const rows = await db
		.select({ muterId: muting.muterId })
		.from(muting)
		.where(and(
			eq(muting.muteeId, muteeId),
			sql`${muting.muterId} = ANY(${sql.param(muterIds)})`,
		));

	return rows.map(row => row.muterId);
}

export async function fetchMutingByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: MiMuting['id'],
): Promise<MiMuting> {
	const [row] = await db
		.select()
		.from(muting)
		.where(eq(muting.id, id))
		.limit(1);

	if (row == null) {
		throw new EntityNotFoundError('MiMuting', { id });
	}

	return deserializeMuting(row);
}

export async function fetchMutingByMuterIdAndMuteeIdFromDatabase(
	db: MiDrizzleDatabase,
	muterId: MiUser['id'],
	muteeId: MiUser['id'],
): Promise<MiMuting | null> {
	const [row] = await db
		.select()
		.from(muting)
		.where(and(
			eq(muting.muterId, muterId),
			eq(muting.muteeId, muteeId),
		))
		.limit(1);

	return row ? deserializeMuting(row) : null;
}

export async function listPermanentMutingsByMuterIdFromDatabase(
	db: MiDrizzleDatabase,
	muterId: MiUser['id'],
	options: {
		limit: number;
		sinceId?: MiMuting['id'] | null;
	},
): Promise<MiMuting[]> {
	const conditions = [
		eq(muting.muterId, muterId),
		isNull(muting.expiresAt),
	];

	if (options.sinceId) {
		conditions.push(gt(muting.id, options.sinceId));
	}

	const rows = await db
		.select()
		.from(muting)
		.where(and(...conditions))
		.orderBy(asc(muting.id))
		.limit(options.limit);

	return rows.map(row => deserializeMuting(row));
}

export async function listMutingsByMuterIdWithPaginationFromDatabase(
	db: MiDrizzleDatabase,
	muterId: MiUser['id'],
	options: {
		limit: number;
		sinceId?: MiMuting['id'] | null;
		untilId?: MiMuting['id'] | null;
		order: MutingOrder;
	},
): Promise<MiMuting[]> {
	const conditions: SQL[] = [eq(muting.muterId, muterId)];

	applyMutingPaginationCondition(conditions, options.sinceId, options.untilId);

	const rows = await db
		.select()
		.from(muting)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(muting.id) : desc(muting.id))
		.limit(options.limit);

	return rows.map(row => deserializeMuting(row));
}

export async function listMuteeIdsByMuterIdFromDatabase(
	db: MiDrizzleDatabase,
	muterId: MiUser['id'],
): Promise<MiUser['id'][]> {
	const rows = await db
		.select({ muteeId: muting.muteeId })
		.from(muting)
		.where(eq(muting.muterId, muterId));

	return rows.map(row => row.muteeId);
}

export async function listActiveMutingsByMuteeIdFromDatabase(
	db: MiDrizzleDatabase,
	muteeId: MiUser['id'],
	now: Date,
): Promise<MiMuting[]> {
	const rows = await db
		.select()
		.from(muting)
		.where(and(
			eq(muting.muteeId, muteeId),
			or(
				isNull(muting.expiresAt),
				gt(muting.expiresAt, now),
			),
		));

	return rows.map(row => deserializeMuting(row));
}

export async function listExpiredMutingsFromDatabase(
	db: MiDrizzleDatabase,
	now: Date,
): Promise<MiMuting[]> {
	const rows = await db
		.select()
		.from(muting)
		.where(and(
			isNotNull(muting.expiresAt),
			lt(muting.expiresAt, now),
		));

	return rows.map(row => deserializeMuting(row));
}

export async function listPermanentMuterIdsByMuteeIdFromDatabase(
	db: MiDrizzleDatabase,
	muteeId: MiUser['id'],
): Promise<MiUser['id'][]> {
	const rows = await db
		.select({ muterId: muting.muterId })
		.from(muting)
		.where(and(
			eq(muting.muteeId, muteeId),
			isNull(muting.expiresAt),
		));

	return rows.map(row => row.muterId);
}

export async function createMutingInDatabase(
	db: MiDrizzleDatabase,
	values: MutingInsert,
): Promise<void> {
	await db
		.insert(muting)
		.values(values);
}

export async function createMutingsInDatabase(
	db: MiDrizzleDatabase,
	values: MutingInsert[],
): Promise<void> {
	if (values.length === 0) return;

	await db
		.insert(muting)
		.values(values);
}

export async function deleteMutingsByIdsFromDatabase(
	db: MiDrizzleDatabase,
	ids: MiMuting['id'][],
): Promise<void> {
	if (ids.length === 0) return;

	await db
		.delete(muting)
		.where(inArray(muting.id, ids));
}
