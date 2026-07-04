/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

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
import { genId } from '@/misc/id/gen-id.js';
import { deepClone } from '@/misc/clone.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { HonoChartWriters } from './hono-chart-runtime.js';

export type HonoQueueSystemDependencies = {
	config: Pick<Config, 'id' | 'deactivateAntennaThreshold'>;
	db: MiDrizzleDatabase;
	chartWriters: HonoChartWriters;
};

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
