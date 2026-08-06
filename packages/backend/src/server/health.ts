/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Redis from 'ioredis';
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { readyRef } from '@/boot/ready.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { Meilisearch } from 'meilisearch';

export type HealthDependencies = {
	redis: Redis.Redis;
	redisForPub: Redis.Redis;
	redisForSub: Redis.Redis;
	redisForTimelines: Redis.Redis;
	redisForReactions: Redis.Redis;
	db: MiDrizzleDatabase;
	meilisearch: Meilisearch | null;
};

export async function checkHealth(deps: HealthDependencies): Promise<boolean> {
	return await Promise.all([
		new Promise<void>((resolve, reject) => (readyRef.value ? resolve() : reject(new Error('server is not ready')))),
		deps.redis.ping(),
		deps.redisForPub.ping(),
		deps.redisForSub.ping(),
		deps.redisForTimelines.ping(),
		deps.redisForReactions.ping(),
		deps.db.execute(sql`SELECT 1`),
		...(deps.meilisearch ? [deps.meilisearch.health()] : []),
	]).then(
		() => true,
		() => false,
	);
}

export function createHealthApp(deps: HealthDependencies): Hono {
	const app = new Hono();

	app.get('/', async (c) => {
		c.header('Cache-Control', 'no-store');
		return c.body(null, (await checkHealth(deps)) ? 200 : 503);
	});

	return app;
}
