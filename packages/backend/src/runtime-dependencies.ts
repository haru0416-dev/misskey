/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Redis from 'ioredis';
import { Meilisearch } from 'meilisearch';
import { fetchMetaFromDatabase } from '@/core/MetaStore.js';
import type { Config } from '@/config.js';
import type { MiMeta } from '@/models/_.js';
import { createDrizzleDatabase, createDrizzlePool } from '@/drizzle.js';
import type { MiDrizzleDatabase, MiDrizzlePool } from '@/drizzle.js';
import { allSettled } from '@/misc/promise-tracker.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';

export type RuntimeDependencies = {
	config: Config;
	drizzlePool: MiDrizzlePool;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	meilisearch: Meilisearch | null;
	redis: Redis.Redis;
	redisForPub: Redis.Redis;
	redisForSub: Redis.Redis;
	redisForTimelines: Redis.Redis;
	redisForReactions: Redis.Redis;
	dispose: () => Promise<void>;
};

export type RuntimeResources = {
	drizzlePool: MiDrizzlePool;
	redis: Redis.Redis;
	redisForPub: Redis.Redis;
	redisForSub: Redis.Redis;
	redisForTimelines: Redis.Redis;
	redisForReactions: Redis.Redis;
};

export function createMeilisearchClient(config: Config): Meilisearch | null {
	if (config.fulltextSearch?.provider !== 'meilisearch') {
		return null;
	}

	if (!config.meilisearch) {
		throw new Error('Meilisearch is enabled but no configuration is provided');
	}

	return new Meilisearch({
		host: `${config.meilisearch.ssl ? 'https' : 'http'}://${config.meilisearch.host}:${config.meilisearch.port}`,
		apiKey: config.meilisearch.apiKey,
	});
}

export function createRedisClient(config: Config): Redis.Redis {
	return new Redis.Redis(config.redis);
}

export function createRedisForPub(config: Config): Redis.Redis {
	return new Redis.Redis(config.redisForPubsub);
}

export async function createRedisForSub(config: Config): Promise<Redis.Redis> {
	const redis = new Redis.Redis(config.redisForPubsub);
	await redis.subscribe(config.host);
	return redis;
}

export function createRedisForTimelines(config: Config): Redis.Redis {
	return new Redis.Redis(config.redisForTimelines);
}

export function createRedisForReactions(config: Config): Redis.Redis {
	return new Redis.Redis(config.redisForReactions);
}

export async function fetchReactiveMeta(db: MiDrizzleDatabase, redisForSub: Redis.Redis): Promise<MiMeta> {
	const meta = await fetchMetaFromDatabase(db);

	async function onMessage(_: string, data: string): Promise<void> {
		const obj = JSON.parse(data);

		if (obj.channel === 'internal') {
			const { type, body } = obj.message as GlobalEvents['internal']['payload'];
			switch (type) {
				case 'metaUpdated': {
					for (const key in body.after) {
						(meta as any)[key] = (body.after as any)[key];
					}
					meta.rootUser = null;
					break;
				}
				default:
					break;
			}
		}
	}

	redisForSub.on('message', onMessage);

	return meta;
}

export async function closeRedisConnection(redis: Redis.Redis): Promise<void> {
	try {
		await redis.quit();
	} catch {
		redis.disconnect();
	}
}

export async function disposeRuntimeResources(resources: RuntimeResources): Promise<void> {
	await allSettled();
	await Promise.all([
		resources.drizzlePool.end(),
		closeRedisConnection(resources.redis),
		closeRedisConnection(resources.redisForPub),
		closeRedisConnection(resources.redisForSub),
		closeRedisConnection(resources.redisForTimelines),
		closeRedisConnection(resources.redisForReactions),
	]);
}

export async function createRuntimeDependencies(config: Config): Promise<RuntimeDependencies> {
	const drizzlePool = createDrizzlePool(config);
	const db = createDrizzleDatabase(drizzlePool, config);
	const redis = createRedisClient(config);
	const redisForPub = createRedisForPub(config);
	const redisForSub = await createRedisForSub(config);
	const redisForTimelines = createRedisForTimelines(config);
	const redisForReactions = createRedisForReactions(config);
	const meilisearch = createMeilisearchClient(config);
	const meta = await fetchReactiveMeta(db, redisForSub);

	return {
		config,
		drizzlePool,
		db,
		meta,
		meilisearch,
		redis,
		redisForPub,
		redisForSub,
		redisForTimelines,
		redisForReactions,
		dispose: async () => {
			await disposeRuntimeResources({ drizzlePool, redis, redisForPub, redisForSub, redisForTimelines, redisForReactions });
		},
	};
}
