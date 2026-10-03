/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiDrizzleDatabase } from '@/drizzle.js';
import type * as Redis from 'ioredis';
import type { Logger } from '@/logger.js';
import { acquireChartInsertLock } from '@/misc/distributed-lock.js';
import { createChart } from '@/core/chart/core.js';
import { name, schema } from './entities/test.js';

export function createTestChart(db: MiDrizzleDatabase, redisClient: Redis.Redis, logger: Logger) {
	let total = 0;

	const { commit, ...chart } = createChart({
		db,
		lock: (k) => acquireChartInsertLock(redisClient, k),
		logger,
		name,
		schema,
		tickMajor: async () => ({ 'foo.total': total }),
	});

	return {
		...chart,

		// 範囲を超える差分など、increment / decrement では作れない差分を積むための入口。
		commit,

		get total(): number {
			return total;
		},

		set total(value: number) {
			total = value;
		},

		async increment(): Promise<void> {
			total++;

			commit({
				'foo.total': 1,
				'foo.inc': 1,
			});
		},

		async decrement(): Promise<void> {
			total--;

			commit({
				'foo.total': -1,
				'foo.dec': 1,
			});
		},
	};
}

export type TestChart = ReturnType<typeof createTestChart>;
