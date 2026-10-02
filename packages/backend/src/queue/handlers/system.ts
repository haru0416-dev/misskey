/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { deleteUserIpsOlderThanFromDatabase } from '@/core/user/user-ip-store.js';
import { deactivateAntennasNotUsedSinceFromDatabase } from '@/core/antenna/antenna-store.js';
import { deleteExpiredRoleAssignmentsFromDatabase } from '@/core/role/role-assignment-store.js';
import {
	createRetentionAggregationInDatabase,
	listActiveLocalUserIdsAfter,
	listLocalUserIdsCreatedAfter,
	listRetentionAggregationsCreatedAfter,
	updateRetentionAggregationDataInDatabase,
} from '@/core/retention/retention-aggregation-store.js';
import { deleteMutingsByIdsFromDatabase, listExpiredMutingsFromDatabase } from '@/core/user/muting-store.js';
import {
	deleteChannelMutingsByIdsFromDatabase,
	listExpiredChannelMutingsFromDatabase,
} from '@/core/channel/channel-muting-store.js';
import { genId } from '@/misc/id/gen-id.js';
import { deepClone } from '@/misc/clone.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { ChartWriters } from '../../core/chart/chart-runtime.js';
import type { InternalEventPublisher } from '../../core/events.js';

export type QueueSystemDependencies = {
	config: Pick<Config, 'maintenance'>;
	db: MiDrizzleDatabase;
	chartWriters: ChartWriters;
	publishInternalEvent?: InternalEventPublisher;
};

/** DBへの同時接続を避けるため直列に実行する。 */
export async function handleQueueTickCharts(deps: QueueSystemDependencies): Promise<void> {
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

export async function handleQueueResyncCharts(deps: QueueSystemDependencies): Promise<void> {
	await deps.chartWriters.driveChart.resync();
	await deps.chartWriters.notesChart.resync();
	await deps.chartWriters.usersChart.resync();
}

export async function handleQueueCleanCharts(deps: QueueSystemDependencies): Promise<void> {
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

export async function handleQueueClean(deps: QueueSystemDependencies): Promise<void> {
	await deleteUserIpsOlderThanFromDatabase(deps.db, new Date(Date.now() - 1000 * 60 * 60 * 24 * 90));

	if (deps.config.maintenance.antennaInactiveAfterMs > 0) {
		void deactivateAntennasNotUsedSinceFromDatabase(
			deps.db,
			new Date(Date.now() - deps.config.maintenance.antennaInactiveAfterMs),
		);
	}

	await deleteExpiredRoleAssignmentsFromDatabase(deps.db, new Date());
}

export async function handleQueueAggregateRetention(deps: QueueSystemDependencies): Promise<void> {
	const now = new Date();
	const dateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

	const pastRecords = await listRetentionAggregationsCreatedAfter(
		deps.db,
		new Date(Date.now() - 1000 * 60 * 60 * 24 * 31),
	);

	const targetUserIds = await listLocalUserIdsCreatedAfter(deps.db, genId(Date.now() - 1000 * 60 * 60 * 24));

	try {
		await createRetentionAggregationInDatabase(deps.db, {
			id: genId(),
			createdAt: now,
			updatedAt: now,
			dateKey,
			userIds: targetUserIds,
			usersCount: targetUserIds.length,
		});
	} catch (err) {
		if (isDuplicateKeyValueError(err)) {
			// 同じ日付の集計行が既にある場合は、既存の処理に任せる。
			return;
		}
		throw err;
	}

	const activeUsersIds = await listActiveLocalUserIdsAfter(deps.db, new Date(Date.now() - 1000 * 60 * 60 * 24));
	const activeUserIdSet = new Set(activeUsersIds);

	for (const record of pastRecords) {
		const retention = record.userIds.filter((id) => activeUserIdSet.has(id)).length;

		const data = deepClone(record.data) as Record<string, number>;
		data[dateKey] = retention;

		await updateRetentionAggregationDataInDatabase(deps.db, record.id, data, now);
	}
}

export async function handleQueueCheckExpiredMutings(deps: QueueSystemDependencies): Promise<void> {
	const expiredMutings = await listExpiredMutingsFromDatabase(deps.db, new Date());
	if (expiredMutings.length > 0) {
		await deleteMutingsByIdsFromDatabase(
			deps.db,
			expiredMutings.map((m) => m.id),
		);

		for (const muting of expiredMutings) {
			deps.publishInternalEvent?.('unmute', { muterId: muting.muterId, muteeId: muting.muteeId });
		}
	}

	const expiredChannelMutings = await listExpiredChannelMutingsFromDatabase(deps.db, new Date());
	if (expiredChannelMutings.length > 0) {
		await deleteChannelMutingsByIdsFromDatabase(
			deps.db,
			expiredChannelMutings.map((m) => m.id),
		);

		for (const muting of expiredChannelMutings) {
			deps.publishInternalEvent?.('unmuteChannel', { userId: muting.userId, channelId: muting.channelId });
		}
	}
}
