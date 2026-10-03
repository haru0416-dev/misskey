/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiDrizzleDatabase } from '@/drizzle.js';
import type * as Redis from 'ioredis';
import type { Logger } from '@/logger.js';
import { acquireChartInsertLock } from '@/misc/distributed-lock.js';
import { createChart } from '@/core/chart/core.js';
import { name, schema } from './entities/test-intersection.js';

export function createTestIntersectionChart(db: MiDrizzleDatabase, redisClient: Redis.Redis, logger: Logger) {
	const { commit, ...chart } = createChart({
		db,
		lock: (k) => acquireChartInsertLock(redisClient, k),
		logger,
		name,
		schema,
	});

	return {
		...chart,

		async addA(key: string): Promise<void> {
			commit({
				a: [key],
			});
		},

		async addB(key: string): Promise<void> {
			commit({
				b: [key],
			});
		},
	};
}

export type TestIntersectionChart = ReturnType<typeof createTestIntersectionChart>;
