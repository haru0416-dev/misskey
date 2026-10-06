/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import type * as Redis from 'ioredis';
import type { DeliverQueue } from '@/core/queue/queues.js';
import { deliveryQueueCleanup } from '@/db/schema/delivery-queue-cleanup.js';
import type { DeliveryQueueCleanupRow } from '@/db/schema/delivery-queue-cleanup.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';

const CLAIM_LEASE_MS = 30_000;
const BATCH_SIZE = 500;
const CONCURRENCY = 16;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

/** 配送の完了記録と同じ transaction を使い、本文や coordinator の寿命に依存させない。 */
export async function enqueueDeliveryQueueCleanupInDatabase(
	db: MiDrizzleDatabase,
	jobIds: readonly string[],
): Promise<void> {
	for (let offset = 0; offset < jobIds.length; offset += BATCH_SIZE) {
		await db
			.insert(deliveryQueueCleanup)
			.values(jobIds.slice(offset, offset + BATCH_SIZE).map((jobId) => ({ jobId })))
			.onConflictDoNothing();
	}
}

export async function fetchDeliveryQueueCleanupByJobIdFromDatabase(
	db: MiDrizzleDatabase,
	jobId: string,
): Promise<DeliveryQueueCleanupRow | null> {
	const [row] = await db.select().from(deliveryQueueCleanup).where(eq(deliveryQueueCleanup.jobId, jobId));
	return row ?? null;
}

export async function fetchDeliveryQueueCleanupStats(db: MiDrizzleDatabase): Promise<{
	pending: number;
	retrying: number;
	oldestPendingAgeMs: number | null;
}> {
	const [stats] = await db
		.select({
			pending: sql<number>`count(*)::integer`,
			retrying: sql<number>`count(*) FILTER (WHERE ${deliveryQueueCleanup.attempts} > 0)::integer`,
			oldestPendingAgeMs: sql<
				number | null
			>`(extract(epoch from (CURRENT_TIMESTAMP - min(${deliveryQueueCleanup.createdAt}))) * 1000)::double precision`,
		})
		.from(deliveryQueueCleanup);
	if (stats == null) throw new Error('Delivery queue cleanup aggregate query returned no rows');
	return {
		pending: stats.pending,
		retrying: stats.retrying,
		oldestPendingAgeMs: stats.oldestPendingAgeMs == null ? null : Math.max(0, stats.oldestPendingAgeMs),
	};
}

async function claimCleanupRows(db: MiDrizzleDatabase): Promise<{ jobIds: string[]; leaseToken: string }> {
	const leaseToken = genId();
	const candidates = db.$with('cleanup_candidates').as(
		db
			.select({ jobId: deliveryQueueCleanup.jobId })
			.from(deliveryQueueCleanup)
			// デフォルトの availableAt と同じ DB 時計で、再試行とリース期限を判定する。
			.where(sql`${deliveryQueueCleanup.availableAt} <= CURRENT_TIMESTAMP AND (
				${deliveryQueueCleanup.leaseExpiresAt} IS NULL OR ${deliveryQueueCleanup.leaseExpiresAt} <= CURRENT_TIMESTAMP
			)`)
			.orderBy(deliveryQueueCleanup.availableAt, deliveryQueueCleanup.createdAt, deliveryQueueCleanup.jobId)
			.limit(BATCH_SIZE)
			.for('update', { skipLocked: true }),
	);
	const rows = await db
		.with(candidates)
		.update(deliveryQueueCleanup)
		.set({
			leaseToken,
			leaseExpiresAt: sql`CURRENT_TIMESTAMP + (${CLAIM_LEASE_MS} * interval '1 millisecond')`,
		})
		.where(inArray(deliveryQueueCleanup.jobId, db.select({ jobId: candidates.jobId }).from(candidates)))
		.returning({ jobId: deliveryQueueCleanup.jobId });
	return { jobIds: rows.map((row) => row.jobId), leaseToken };
}

async function removeTerminalDeliveryJob(deliverQueue: DeliverQueue, jobId: string): Promise<void> {
	const state = await deliverQueue.getJobState(jobId);
	if (state === 'unknown') {
		const client = (await deliverQueue.getBackend().client) as unknown as Redis.Redis;
		// unknown は状態索引から外れた既存ジョブでも返る。不在だけを完了として扱う。
		if ((await client.exists(deliverQueue.toKey(jobId))) === 0) return;
		throw new Error(`Delivery job ${jobId} exists without a terminal queue state`);
	}
	if (state !== 'completed' && state !== 'failed') {
		throw new Error(`Delivery job ${jobId} is not terminal: ${state}`);
	}
	// BullMQ はロック中のジョブを削除できない場合に例外ではなく 0 を返す。
	if ((await deliverQueue.remove(jobId, { removeChildren: false })) !== 1) {
		throw new Error(`Delivery job ${jobId} could not be removed because it is locked`);
	}
}

/**
 * リース切れだけでは実行中の所有者を引き継がない。行ロック取得後の token 照合から
 * Valkey 削除と SQL 更新までロックを保持し、SQL rollback 後は不在ジョブとして再完了できる。
 */
async function cleanClaimedRow(
	db: MiDrizzleDatabase,
	deliverQueue: DeliverQueue,
	jobId: string,
	leaseToken: string,
): Promise<{ removed: number; error?: Error }> {
	return await db.transaction(async (transaction) => {
		const tx = transaction as MiDrizzleDatabase;
		const [row] = await tx
			.select()
			.from(deliveryQueueCleanup)
			.where(eq(deliveryQueueCleanup.jobId, jobId))
			.for('update');
		if (row == null || row.leaseToken !== leaseToken) return { removed: 0 };
		const owned = and(eq(deliveryQueueCleanup.jobId, jobId), eq(deliveryQueueCleanup.leaseToken, leaseToken));
		try {
			await removeTerminalDeliveryJob(deliverQueue, jobId);
		} catch (error) {
			const backoffMs = Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * 2 ** Math.min(row.attempts, 5));
			// Valkey の待機時間を backoff から引かないよう、transaction 開始時刻ではなく故障後の DB 時計を使う。
			await tx
				.update(deliveryQueueCleanup)
				.set({
					availableAt: sql`clock_timestamp() + (${backoffMs} * interval '1 millisecond')`,
					leaseToken: null,
					leaseExpiresAt: null,
					attempts: row.attempts + 1,
					lastError: error instanceof Error ? error.message : String(error),
				})
				.where(owned);
			return { removed: 0, error: new Error(`Delivery queue cleanup failed for ${jobId}`, { cause: error }) };
		}
		// SQL の故障は queue の故障として記録しない。rollback で残る receipt とリースから回復する。
		await tx.delete(deliveryQueueCleanup).where(owned);
		return { removed: 1 };
	});
}

export async function runDeliveryQueueCleanup(db: MiDrizzleDatabase, deliverQueue: DeliverQueue): Promise<number> {
	const { jobIds, leaseToken } = await claimCleanupRows(db);
	let next = 0;
	let removed = 0;
	const errors: unknown[] = [];
	await Promise.all(
		Array.from({ length: Math.min(CONCURRENCY, jobIds.length) }, async () => {
			while (next < jobIds.length) {
				const jobId = jobIds[next++]!;
				try {
					const result = await cleanClaimedRow(db, deliverQueue, jobId, leaseToken);
					removed += result.removed;
					if (result.error != null) errors.push(result.error);
				} catch (error) {
					errors.push(new Error(`Delivery queue cleanup transaction failed for ${jobId}`, { cause: error }));
				}
			}
		}),
	);
	// 個別故障で後続の処理を止めず、永続化した再試行も呼出元の logger に通知する。
	if (errors.length > 0) throw new AggregateError(errors, 'Delivery queue cleanup batch failed');
	return removed;
}
