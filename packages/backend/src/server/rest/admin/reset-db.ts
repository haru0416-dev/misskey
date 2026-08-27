/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { setTimeout as delay } from 'node:timers/promises';
import type * as Redis from 'ioredis';
import { z } from 'zod';
import { fetchMetaFromDatabase } from '@/core/meta/MetaStore.js';
import type { MiDrizzleDatabase, MiDrizzlePool } from '@/drizzle.js';
import type Logger from '@/logger.js';
import { resetDb } from '@/misc/reset-db.js';
import type { MiMeta } from '@/models/_.js';
import type { SignupInternalEventPublisher } from '../auth/signup.js';
import { parseApiParams } from '../validation.js';

export type ApiResetDbDependencies = {
	db: MiDrizzleDatabase;
	dbPool: MiDrizzlePool;
	meta: MiMeta;
	redis: Redis.Redis;
	logger: Pick<Logger, 'info'>;
	publishInternalEvent?: SignupInternalEventPublisher;
};

export const resetDbParamDef = z.object({});

export async function handleApiResetDb(deps: ApiResetDbDependencies, body: Record<string, unknown>): Promise<void> {
	parseApiParams(resetDbParamDef, body);

	if (process.env['NODE_ENV'] !== 'test') throw new Error('NODE_ENV is not a test');

	deps.logger.info('---- Resetting database...');

	await deps.redis.flushdb();
	await resetDb(deps.dbPool);

	const after = await fetchMetaFromDatabase(deps.db);
	Object.assign(deps.meta, after);
	deps.meta.rootUser = null;
	deps.publishInternalEvent?.('metaUpdated', { after });

	deps.logger.info('---- Database reset complete.');

	await delay(1000);
}
