/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq, inArray, sql, getTableName } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { defineQueryPlan } from '@/db/prepared.js';
import { renoteMuting } from '@/db/schema/renote-muting.js';
import type { RenoteMutingInsert, RenoteMutingRow } from '@/db/schema/renote-muting.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiUser } from '@/models/User.js';
import { pushIdPaginationConditions } from '@/db/id-pagination.js';

export type RenoteMutingOrder = 'asc' | 'desc';

function renoteMutingCondition(muterId: MiUser['id'], muteeId: MiUser['id']) {
	return and(eq(renoteMuting.muterId, muterId), eq(renoteMuting.muteeId, muteeId));
}

/** muteeId のリノートをミュートしている muterId 一覧 (ノート作成ファンアウトの一括判定用)。 */
export async function listRenoteMuterIdsByMuteeIdFromDatabase(
	db: MiDrizzleDatabase,
	muteeId: MiUser['id'],
): Promise<MiUser['id'][]> {
	const rows = await db
		.select({ muterId: renoteMuting.muterId })
		.from(renoteMuting)
		.where(eq(renoteMuting.muteeId, muteeId));

	return rows.map((row) => row.muterId);
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
	const [row] = await db.select().from(renoteMuting).where(renoteMutingCondition(muterId, muteeId)).limit(1);

	return row ?? null;
}

export async function createRenoteMutingInDatabase(db: MiDrizzleDatabase, data: RenoteMutingInsert): Promise<void> {
	await db.insert(renoteMuting).values(data);
}

export async function deleteRenoteMutingsByIdsFromDatabase(
	db: MiDrizzleDatabase,
	ids: RenoteMutingRow['id'][],
): Promise<void> {
	if (ids.length === 0) {
		return;
	}

	await db.delete(renoteMuting).where(inArray(renoteMuting.id, ids));
}

const renoteMutingMuteeIdsByMuterIdPlan = defineQueryPlan((db) => {
	const selection = { muteeId: renoteMuting.muteeId };
	return {
		query: db
			.select(selection)
			.from(renoteMuting)
			.where(eq(renoteMuting.muterId, sql.placeholder('muterId'))),
		selection,
		metadata: { type: 'select', tables: [getTableName(renoteMuting)] },
	};
});

export async function listRenoteMuteeIdsByMuterIdFromDatabase(
	db: MiDrizzleDatabase,
	muterId: MiUser['id'],
): Promise<MiUser['id'][]> {
	const rows = await renoteMutingMuteeIdsByMuterIdPlan.execute(db, { muterId });

	return rows.map((row) => row.muteeId);
}

export async function listRenoteMuteeIdsByMuterIdAndMuteeIdsFromDatabase(
	db: MiDrizzleDatabase,
	muterId: MiUser['id'],
	muteeIds: MiUser['id'][],
): Promise<MiUser['id'][]> {
	if (muteeIds.length === 0) {
		return [];
	}

	const rows = await db
		.select({ muteeId: renoteMuting.muteeId })
		.from(renoteMuting)
		.where(and(eq(renoteMuting.muterId, muterId), sql`${renoteMuting.muteeId} = ANY(${sql.param(muteeIds)})`));

	return rows.map((row) => row.muteeId);
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
	const conditions: SQL[] = [eq(renoteMuting.muterId, muterId)];

	pushIdPaginationConditions(conditions, renoteMuting.id, options.sinceId, options.untilId);

	return await db
		.select()
		.from(renoteMuting)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(renoteMuting.id) : desc(renoteMuting.id))
		.limit(options.limit);
}
