/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { count, inArray, min, sql } from 'drizzle-orm';
import type * as Bull from 'bullmq';
import type { DbQueue } from '@/core/queues.js';
import { queueOutbox } from '@/db/schema/queue-outbox.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { QUEUE } from '@/queue/const.js';

export async function enqueueDbJobInOutbox(
	db: MiDrizzleDatabase,
	name: string,
	data: Record<string, unknown>,
	opts: Bull.JobsOptions,
): Promise<string> {
	const id = genId();
	await db.insert(queueOutbox).values({
		id,
		queue: QUEUE.DB,
		name,
		data,
		opts,
	});
	return id;
}

export async function dispatchQueueOutbox(db: MiDrizzleDatabase, dbQueue: DbQueue): Promise<number> {
	return await db.transaction(async tx => {
		const rows = await tx
			.select()
			.from(queueOutbox)
			.where(sql`${queueOutbox.queue} = ${QUEUE.DB}`)
			.orderBy(queueOutbox.createdAt)
			.limit(100)
			.for('update', { skipLocked: true });

		if (rows.length === 0) return 0;

		await dbQueue.addBulk(rows.map(row => ({
			name: row.name,
			data: row.data as Record<string, unknown>,
			opts: { ...(row.opts as Bull.JobsOptions), jobId: `outbox-${row.id}` },
		})));
		await tx.delete(queueOutbox).where(inArray(queueOutbox.id, rows.map(row => row.id)));
		return rows.length;
	});
}

export async function getQueueOutboxStats(db: MiDrizzleDatabase): Promise<{ pending: number; oldestPendingAgeMs: number | null }> {
	const [stats] = await db.select({
		pending: count(),
		oldestCreatedAt: min(queueOutbox.createdAt),
	}).from(queueOutbox);

	return {
		pending: stats.pending,
		oldestPendingAgeMs: stats.oldestCreatedAt == null ? null : Math.max(0, Date.now() - stats.oldestCreatedAt.getTime()),
	};
}
