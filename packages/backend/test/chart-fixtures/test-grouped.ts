/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiDrizzleDatabase } from '@/drizzle.js';
import type * as Redis from 'ioredis';
import type { Logger } from '@/logger.js';
import { acquireChartInsertLock } from '@/misc/distributed-lock.js';
import { createChart } from '@/core/chart/core.js';
import { name, schema } from './entities/test-grouped.js';

export function createTestGroupedChart(db: MiDrizzleDatabase, redisClient: Redis.Redis, logger: Logger) {
	const totals = {} as Record<string, number>;

	const { commit, ...chart } = createChart({
		db,
		lock: (k) => acquireChartInsertLock(redisClient, k),
		logger,
		name,
		schema,
		tickMajor: async (group) => {
			const total = group == null ? undefined : totals[group];
			return total === undefined ? {} : { 'foo.total': total };
		},
	});

	return {
		...chart,

		async increment(group: string): Promise<void> {
			if (totals[group] == null) {
				totals[group] = 0;
			}

			totals[group]++;

			commit(
				{
					'foo.total': 1,
					'foo.inc': 1,
				},
				group,
			);
		},
	};
}

export type TestGroupedChart = ReturnType<typeof createTestGroupedChart>;
