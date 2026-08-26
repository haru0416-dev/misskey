/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiDrizzleDatabase } from '@/drizzle.js';
import * as Redis from 'ioredis';
import Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { acquireChartInsertLock } from '@/misc/distributed-lock.js';
import Chart from '@/core/chart/core.js';
import { name, schema } from './entities/test.js';
import type { KVs } from '@/core/chart/core.js';

export default class TestChart extends Chart<typeof schema> {
	public total = 0; // publicにするのはテストのため

	constructor(
		private db: MiDrizzleDatabase,

		private redisClient: Redis.Redis,

		logger: Logger,
	) {
		super(db, (k) => acquireChartInsertLock(redisClient, k), logger, name, schema);
	}

	protected async tickMajor(): Promise<Partial<KVs<typeof schema>>> {
		return {
			'foo.total': this.total,
		};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof schema>>> {
		return {};
	}

	@bindThis
	public async increment(): Promise<void> {
		this.total++;

		this.commit({
			'foo.total': 1,
			'foo.inc': 1,
		});
	}

	@bindThis
	public async decrement(): Promise<void> {
		this.total--;

		this.commit({
			'foo.total': -1,
			'foo.dec': 1,
		});
	}
}
