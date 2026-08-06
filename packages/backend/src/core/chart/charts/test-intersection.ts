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
import { name, schema } from './entities/test-intersection.js';
import type { KVs } from '../core.js';

/**
 * For testing
 */
export default class TestIntersectionChart extends Chart<typeof schema> {
	// eslint-disable-line import/no-default-export
	constructor(
		private db: MiDrizzleDatabase,

		private redisClient: Redis.Redis,

		logger: Logger,
	) {
		super(db, (k) => acquireChartInsertLock(redisClient, k), logger, name, schema);
	}

	protected async tickMajor(): Promise<Partial<KVs<typeof schema>>> {
		return {};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof schema>>> {
		return {};
	}

	@bindThis
	public async addA(key: string): Promise<void> {
		this.commit({
			a: [key],
		});
	}

	@bindThis
	public async addB(key: string): Promise<void> {
		this.commit({
			b: [key],
		});
	}
}
