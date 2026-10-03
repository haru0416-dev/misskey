/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiDrizzleDatabase } from '@/drizzle.js';
import type * as Redis from 'ioredis';
import type { Logger } from '@/logger.js';
import { acquireChartInsertLock } from '@/misc/distributed-lock.js';
import { createChart } from '@/core/chart/core.js';
import { name, schema } from './entities/test-unique.js';

export function createTestUniqueChart(db: MiDrizzleDatabase, redisClient: Redis.Redis, logger: Logger) {
	const { commit, ...chart } = createChart({
		db,
		lock: (k) => acquireChartInsertLock(redisClient, k),
		logger,
		name,
		schema,
	});

	return {
		...chart,

		async uniqueIncrement(key: string): Promise<void> {
			commit({
				foo: [key],
			});
		},
	};
}

export type TestUniqueChart = ReturnType<typeof createTestUniqueChart>;
