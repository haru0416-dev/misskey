/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq, gt, lt, sql, type SQL } from 'drizzle-orm';
import { moderationLog, type ModerationLogInsert, type ModerationLogRow } from '@/db/schema/moderation-log.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import type { MiModerationLog } from '@/models/ModerationLog.js';
import type { MiUser } from '@/models/User.js';

export type ModerationLogOrder = 'asc' | 'desc';

function deserializeModerationLog(row: ModerationLogRow): MiModerationLog {
	return {
		...row,
		user: null,
	} as MiModerationLog;
}

function applyModerationLogPaginationCondition(
	conditions: SQL[],
	sinceId?: string | null,
	untilId?: string | null,
): void {
	if (sinceId && untilId) {
		conditions.push(gt(moderationLog.id, sinceId));
		conditions.push(lt(moderationLog.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(moderationLog.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(moderationLog.id, untilId));
	}
}

export async function createModerationLogInDatabase(db: MiDrizzleDatabase, data: ModerationLogInsert): Promise<void> {
	await db.insert(moderationLog).values(data);
}

export async function createModerationLogsInDatabase(
	db: MiDrizzleDatabase,
	data: ModerationLogInsert[],
): Promise<void> {
	if (data.length === 0) return;

	const batchSize = 10_000;
	const insertBatch = async (offset: number): Promise<void> => {
		const batch = data.slice(offset, offset + batchSize);
		if (batch.length === 0) return;

		await db.insert(moderationLog).values(batch);
		await insertBatch(offset + batchSize);
	};

	await insertBatch(0);
}

export async function fetchModerationLogByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: MiModerationLog['id'],
): Promise<MiModerationLog> {
	const [row] = await db.select().from(moderationLog).where(eq(moderationLog.id, id)).limit(1);

	if (row == null) {
		throw new Error(`Moderation log ${id} not found`);
	}

	return deserializeModerationLog(row);
}

export async function listModerationLogsFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		limit: number;
		order: ModerationLogOrder;
		sinceId?: string | null;
		untilId?: string | null;
		type?: string | null;
		userId?: MiUser['id'] | null;
		search?: string | null;
	},
): Promise<MiModerationLog[]> {
	const conditions: SQL[] = [];

	applyModerationLogPaginationCondition(conditions, options.sinceId, options.untilId);

	if (options.type != null) {
		conditions.push(eq(moderationLog.type, options.type));
	}

	if (options.userId != null) {
		conditions.push(eq(moderationLog.userId, options.userId));
	}

	if (options.search != null) {
		conditions.push(sql`${moderationLog.info}::text ILIKE ${`%${sqlLikeEscape(options.search)}%`}`);
	}

	const rows = await db
		.select()
		.from(moderationLog)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(options.order === 'asc' ? asc(moderationLog.id) : desc(moderationLog.id))
		.limit(options.limit);

	return rows.map(deserializeModerationLog);
}
