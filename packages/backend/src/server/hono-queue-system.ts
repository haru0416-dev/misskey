/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';
import { deleteUserIpsOlderThanFromDatabase } from '@/core/UserIpStore.js';
import { deactivateAntennasNotUsedSinceFromDatabase } from '@/core/AntennaStore.js';
import { deleteExpiredRoleAssignmentsFromDatabase } from '@/core/RoleAssignmentStore.js';
import {
	createRetentionAggregationInDatabase,
	listActiveLocalUserIdsAfter,
	listLocalUserIdsCreatedAfter,
	listRetentionAggregationsCreatedAfter,
	updateRetentionAggregationDataInDatabase,
} from '@/core/RetentionAggregationStore.js';
import { deleteMutingsByIdsFromDatabase, listExpiredMutingsFromDatabase } from '@/core/MutingStore.js';
import { deleteChannelMutingsByIdsFromDatabase, fetchExpiredChannelMutingsFromDatabase, fetchMutedChannelIdsFromDatabase } from '@/core/ChannelMutingStore.js';
import { applyBufferedNoteReactionsInDatabase } from '@/core/NoteStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { deepClone } from '@/misc/clone.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/_.js';
import { refreshUserMutingsCache } from './hono-api-account-mutes.js';
import type { HonoChartWriters } from './hono-chart-runtime.js';

const REACTIONS_BUFFER_DELTA_PREFIX = 'reactionsBufferDeltas';
const REACTIONS_BUFFER_PAIR_PREFIX = 'reactionsBufferPairs';

export type HonoQueueSystemDependencies = {
	config: Pick<Config, 'id' | 'deactivateAntennaThreshold' | 'redis' | 'redisForReactions'>;
	db: MiDrizzleDatabase;
	chartWriters: HonoChartWriters;
	meta: Pick<MiMeta, 'enableReactionsBuffering'>;
	redis: Redis.Redis;
	redisForReactions: Redis.Redis;
};

async function refreshMutingChannelsCache(deps: Pick<HonoQueueSystemDependencies, 'db' | 'redis'>, userId: string): Promise<void> {
	const channelIds = await fetchMutedChannelIdsFromDatabase(deps.db, userId);
	await deps.redis.set(`kvcache:channelMutingChannels:${userId}`, JSON.stringify(channelIds), 'EX', 60 * 30);
}

/** TickChartsProcessorService.process 相当。DBへの同時接続を避けるため直列に実行する。 */
export async function handleHonoQueueTickCharts(deps: HonoQueueSystemDependencies): Promise<void> {
	await deps.chartWriters.federationChart.tick(false);
	await deps.chartWriters.notesChart.tick(false);
	await deps.chartWriters.usersChart.tick(false);
	await deps.chartWriters.activeUsersChart.tick(false);
	await deps.chartWriters.instanceChart.tick(false);
	await deps.chartWriters.perUserNotesChart.tick(false);
	await deps.chartWriters.perUserPvChart.tick(false);
	await deps.chartWriters.driveChart.tick(false);
	await deps.chartWriters.perUserReactionsChart.tick(false);
	await deps.chartWriters.perUserFollowingChart.tick(false);
	await deps.chartWriters.perUserDriveChart.tick(false);
	await deps.chartWriters.apRequestChart.tick(false);
}

/** ResyncChartsProcessorService.process 相当。 */
export async function handleHonoQueueResyncCharts(deps: HonoQueueSystemDependencies): Promise<void> {
	await deps.chartWriters.driveChart.resync();
	await deps.chartWriters.notesChart.resync();
	await deps.chartWriters.usersChart.resync();
}

/** CleanChartsProcessorService.process 相当。 */
export async function handleHonoQueueCleanCharts(deps: HonoQueueSystemDependencies): Promise<void> {
	await deps.chartWriters.federationChart.clean();
	await deps.chartWriters.notesChart.clean();
	await deps.chartWriters.usersChart.clean();
	await deps.chartWriters.activeUsersChart.clean();
	await deps.chartWriters.instanceChart.clean();
	await deps.chartWriters.perUserNotesChart.clean();
	await deps.chartWriters.perUserPvChart.clean();
	await deps.chartWriters.driveChart.clean();
	await deps.chartWriters.perUserReactionsChart.clean();
	await deps.chartWriters.perUserFollowingChart.clean();
	await deps.chartWriters.perUserDriveChart.clean();
	await deps.chartWriters.apRequestChart.clean();
}

/** CleanProcessorService.process 相当。 */
export async function handleHonoQueueClean(deps: HonoQueueSystemDependencies): Promise<void> {
	await deleteUserIpsOlderThanFromDatabase(deps.db, new Date(Date.now() - (1000 * 60 * 60 * 24 * 90)));

	if (deps.config.deactivateAntennaThreshold > 0) {
		void deactivateAntennasNotUsedSinceFromDatabase(deps.db, new Date(Date.now() - deps.config.deactivateAntennaThreshold));
	}

	await deleteExpiredRoleAssignmentsFromDatabase(deps.db, new Date());
}

/** AggregateRetentionProcessorService.process 相当。 */
export async function handleHonoQueueAggregateRetention(deps: HonoQueueSystemDependencies): Promise<void> {
	const now = new Date();
	const dateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

	const pastRecords = await listRetentionAggregationsCreatedAfter(deps.db, new Date(Date.now() - (1000 * 60 * 60 * 24 * 31)));

	const targetUserIds = await listLocalUserIdsCreatedAfter(deps.db, genId(deps.config, Date.now() - (1000 * 60 * 60 * 24)));

	try {
		await createRetentionAggregationInDatabase(deps.db, {
			id: genId(deps.config),
			createdAt: now,
			updatedAt: now,
			dateKey,
			userIds: targetUserIds,
			usersCount: targetUserIds.length,
		});
	} catch (err) {
		if (isDuplicateKeyValueError(err)) {
			// 既に他のワーカーによって処理済み
			return;
		}
		throw err;
	}

	const activeUsersIds = await listActiveLocalUserIdsAfter(deps.db, new Date(Date.now() - (1000 * 60 * 60 * 24)));

	for (const record of pastRecords) {
		const retention = record.userIds.filter(id => activeUsersIds.includes(id)).length;

		const data = deepClone(record.data) as Record<string, number>;
		data[dateKey] = retention;

		await updateRetentionAggregationDataInDatabase(deps.db, record.id, data, now);
	}
}

/**
 * CheckExpiredMutingsProcessorService.process 相当。
 * UserMutingService.unmute()/ChannelMutingService.eraseExpiredMutings() が更新する
 * userMutingsCache/mutingChannelsCache はどちらもRedisKVCache (kvcache:userMutings:<id>/
 * kvcache:channelMutingChannels:<id>) で、NestJS側プロセスとも共有される実体を持つため、
 * DB削除後に必ずリフレッシュする (単なるインプロセスキャッシュではない)。
 */
export async function handleHonoQueueCheckExpiredMutings(deps: HonoQueueSystemDependencies): Promise<void> {
	const expiredMutings = await listExpiredMutingsFromDatabase(deps.db, new Date());
	if (expiredMutings.length > 0) {
		await deleteMutingsByIdsFromDatabase(deps.db, expiredMutings.map(m => m.id));

		const muterIds = [...new Set(expiredMutings.map(m => m.muterId))];
		for (const muterId of muterIds) {
			await refreshUserMutingsCache(deps, muterId);
		}
	}

	const expiredChannelMutings = await fetchExpiredChannelMutingsFromDatabase(deps.db, new Date());
	if (expiredChannelMutings.length > 0) {
		await deleteChannelMutingsByIdsFromDatabase(deps.db, expiredChannelMutings.map(m => m.id));

		const userIds = [...new Set(expiredChannelMutings.map(m => m.userId))];
		for (const userId of userIds) {
			await refreshMutingChannelsCache(deps, userId);
		}
	}
}

/** BakeBufferedReactionsProcessorService.process 相当 (ReactionsBufferingService.bake()込み)。 */
export async function handleHonoQueueBakeBufferedReactions(deps: HonoQueueSystemDependencies): Promise<void> {
	if (!deps.meta.enableReactionsBuffering) return;

	const bufferedNoteIds: string[] = [];
	let cursor = '0';
	do {
		const result = await deps.redisForReactions.scan(
			cursor,
			'MATCH',
			`${deps.config.redis.prefix}:${REACTIONS_BUFFER_DELTA_PREFIX}:*`,
			'COUNT',
			'1000');

		cursor = result[0];
		bufferedNoteIds.push(...result[1].map(x => x.replace(`${deps.config.redis.prefix}:${REACTIONS_BUFFER_DELTA_PREFIX}:`, '')));
	} while (cursor !== '0');

	if (bufferedNoteIds.length === 0) return;

	const pipeline = deps.redisForReactions.pipeline();
	for (const noteId of bufferedNoteIds) {
		pipeline.hgetall(`${REACTIONS_BUFFER_DELTA_PREFIX}:${noteId}`);
		pipeline.zrange(`${REACTIONS_BUFFER_PAIR_PREFIX}:${noteId}`, 0, -1);
	}
	const results = await pipeline.exec();

	const clearPipeline = deps.redisForReactions.pipeline();
	for (const noteId of bufferedNoteIds) {
		clearPipeline.del(`${REACTIONS_BUFFER_DELTA_PREFIX}:${noteId}`);
		clearPipeline.del(`${REACTIONS_BUFFER_PAIR_PREFIX}:${noteId}`);
	}
	await clearPipeline.exec();

	const opsForEachNote = 2;
	for (let i = 0; i < bufferedNoteIds.length; i++) {
		const noteId = bufferedNoteIds[i];
		const resultDeltas = results?.[i * opsForEachNote]?.[1] as Record<string, string> | undefined;
		const resultPairs = results?.[(i * opsForEachNote) + 1]?.[1] as string[] | undefined;

		const deltas: Record<string, number> = {};
		for (const [name, count] of Object.entries(resultDeltas ?? {})) {
			deltas[name] = parseInt(count, 10);
		}

		void applyBufferedNoteReactionsInDatabase(deps.db, noteId, deltas, resultPairs ?? []);
	}
}
