/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import {
	retentionAggregation,
	type RetentionAggregationInsert,
	type RetentionAggregationRow,
} from '@/db/schema/retention-aggregation.js';
import { user as userTable } from '@/db/schema/user.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiUser } from '@/models/User.js';

export async function listRetentionAggregationsCreatedAfter(
	db: MiDrizzleDatabase,
	since: Date,
): Promise<RetentionAggregationRow[]> {
	return db.select().from(retentionAggregation).where(gt(retentionAggregation.createdAt, since));
}

export async function listLatestRetentionAggregations(
	db: MiDrizzleDatabase,
	limit: number,
): Promise<RetentionAggregationRow[]> {
	return db.select().from(retentionAggregation).orderBy(desc(retentionAggregation.id)).limit(limit);
}

export async function createRetentionAggregationInDatabase(
	db: MiDrizzleDatabase,
	data: RetentionAggregationInsert,
): Promise<void> {
	await db.insert(retentionAggregation).values(data);
}

export async function updateRetentionAggregationDataInDatabase(
	db: MiDrizzleDatabase,
	id: RetentionAggregationRow['id'],
	data: Record<string, number>,
	updatedAt: Date,
): Promise<void> {
	await db.update(retentionAggregation).set({ updatedAt, data }).where(eq(retentionAggregation.id, id));
}

export async function listLocalUserIdsCreatedAfter(
	db: MiDrizzleDatabase,
	idLowerBound: MiUser['id'],
): Promise<MiUser['id'][]> {
	const rows = await db
		.select({ id: userTable.id })
		.from(userTable)
		.where(and(gt(userTable.id, idLowerBound), isNull(userTable.host)));

	return rows.map((row) => row.id);
}

export async function listActiveLocalUserIdsAfter(db: MiDrizzleDatabase, since: Date): Promise<MiUser['id'][]> {
	const rows = await db
		.select({ id: userTable.id })
		.from(userTable)
		.where(and(gt(userTable.lastActiveDate, since), isNull(userTable.host)));

	return rows.map((row) => row.id);
}
