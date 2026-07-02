/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq, inArray, gt, lt, type SQL } from 'drizzle-orm';
import { renoteMuting, type RenoteMutingInsert, type RenoteMutingRow } from '@/db/schema/renote-muting.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiUser } from '@/models/User.js';

export type RenoteMutingOrder = 'asc' | 'desc';

function renoteMutingCondition(muterId: MiUser['id'], muteeId: MiUser['id']) {
	return and(
		eq(renoteMuting.muterId, muterId),
		eq(renoteMuting.muteeId, muteeId),
	);
}

function applyRenoteMutingPaginationCondition(
	conditions: SQL[],
	sinceId?: string | null,
	untilId?: string | null,
): void {
	if (sinceId && untilId) {
		conditions.push(gt(renoteMuting.id, sinceId));
		conditions.push(lt(renoteMuting.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(renoteMuting.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(renoteMuting.id, untilId));
	}
}

export async function renoteMutingExistsInDatabase(
	db: MiDrizzleDatabase,
	muterId: MiUser['id'],
	muteeId: MiUser['id'],
): Promise<boolean> {
	const [row] = await db
		.select({ id: renoteMuting.id })
		.from(renoteMuting)
		.where(renoteMutingCondition(muterId, muteeId))
		.limit(1);

	return row != null;
}

export async function fetchRenoteMutingFromDatabase(
	db: MiDrizzleDatabase,
	muterId: MiUser['id'],
	muteeId: MiUser['id'],
): Promise<RenoteMutingRow | null> {
	const [row] = await db
		.select()
		.from(renoteMuting)
		.where(renoteMutingCondition(muterId, muteeId))
		.limit(1);

	return row ?? null;
}

export async function fetchRenoteMutingByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: RenoteMutingRow['id'],
): Promise<RenoteMutingRow> {
	const [row] = await db
		.select()
		.from(renoteMuting)
		.where(eq(renoteMuting.id, id))
		.limit(1);

	if (row == null) {
		throw new Error(`Renote muting ${id} not found`);
	}

	return row;
}

export async function createRenoteMutingInDatabase(
	db: MiDrizzleDatabase,
	data: RenoteMutingInsert,
): Promise<void> {
	await db
		.insert(renoteMuting)
		.values(data);
}

export async function deleteRenoteMutingsByIdsFromDatabase(
	db: MiDrizzleDatabase,
	ids: RenoteMutingRow['id'][],
): Promise<void> {
	if (ids.length === 0) {
		return;
	}

	await db
		.delete(renoteMuting)
		.where(inArray(renoteMuting.id, ids));
}

export async function listRenoteMuteeIdsByMuterIdFromDatabase(
	db: MiDrizzleDatabase,
	muterId: MiUser['id'],
): Promise<MiUser['id'][]> {
	const rows = await db
		.select({ muteeId: renoteMuting.muteeId })
		.from(renoteMuting)
		.where(eq(renoteMuting.muterId, muterId));

	return rows.map(row => row.muteeId);
}

export async function listRenoteMutingsByMuterIdFromDatabase(
	db: MiDrizzleDatabase,
	muterId: MiUser['id'],
	options: {
		limit: number;
		order: RenoteMutingOrder;
		sinceId?: string | null;
		untilId?: string | null;
	},
): Promise<RenoteMutingRow[]> {
	const conditions: SQL[] = [
		eq(renoteMuting.muterId, muterId),
	];

	applyRenoteMutingPaginationCondition(conditions, options.sinceId, options.untilId);

	return await db
		.select()
		.from(renoteMuting)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(renoteMuting.id) : desc(renoteMuting.id))
		.limit(options.limit);
}
