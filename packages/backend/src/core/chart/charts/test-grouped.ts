/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiDrizzleDatabase } from '@/drizzle.js';
import * as Redis from 'ioredis';
import Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { acquireChartInsertLock } from '@/misc/distributed-lock.js';
import Chart from '../core.js';
import { name, schema } from './entities/test-grouped.js';
import type { KVs } from '../core.js';

/**
 * For testing
 */
export default class TestGroupedChart extends Chart<typeof schema> { // eslint-disable-line import/no-default-export
	private total = {} as Record<string, number>;

	constructor(
		private db: MiDrizzleDatabase,

		private redisClient: Redis.Redis,

		logger: Logger,
	) {
		super(db, (k) => acquireChartInsertLock(redisClient, k), logger, name, schema, true);
	}

	protected async tickMajor(group: string): Promise<Partial<KVs<typeof schema>>> {
		const total = this.total[group];
		return total === undefined ? {} : { 'foo.total': total };
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof schema>>> {
		return {};
	}

	@bindThis
	public async increment(group: string): Promise<void> {
		if (this.total[group] == null) this.total[group] = 0;

		this.total[group]++;

		await this.commit({
			'foo.total': 1,
			'foo.inc': 1,
		}, group);
	}
}
