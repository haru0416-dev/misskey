/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Global, Inject, Module } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from './di-symbols.js';
import { Config, loadConfig } from './config.js';
import { createDrizzleDatabase, createDrizzlePool } from './drizzle.js';
import type { MiDrizzleDatabase, MiDrizzlePool } from './drizzle.js';
import { createMeilisearchClient, createRedisClient, createRedisForPub, createRedisForSub, createRedisForTimelines, createRedisForReactions, disposeRuntimeResources, fetchReactiveMeta } from './runtime-dependencies.js';
import type { Provider, OnApplicationShutdown } from '@nestjs/common';

const $config: Provider = {
	provide: DI.config,
	useValue: loadConfig(),
};

const $drizzlePool: Provider = {
	provide: DI.drizzlePool,
	useFactory: (config: Config) => {
		return createDrizzlePool(config);
	},
	inject: [DI.config],
};

const $drizzle: Provider = {
	provide: DI.drizzle,
	useFactory: (pool: MiDrizzlePool, config: Config) => {
		return createDrizzleDatabase(pool, config);
	},
	inject: [DI.drizzlePool, DI.config],
};

const $meilisearch: Provider = {
	provide: DI.meilisearch,
	useFactory: (config: Config) => {
		return createMeilisearchClient(config);
	},
	inject: [DI.config],
};

const $redis: Provider = {
	provide: DI.redis,
	useFactory: (config: Config) => {
		return createRedisClient(config);
	},
	inject: [DI.config],
};

const $redisForPub: Provider = {
	provide: DI.redisForPub,
	useFactory: (config: Config) => {
		return createRedisForPub(config);
	},
	inject: [DI.config],
};

const $redisForSub: Provider = {
	provide: DI.redisForSub,
	useFactory: async (config: Config) => {
		return createRedisForSub(config);
	},
	inject: [DI.config],
};

const $redisForTimelines: Provider = {
	provide: DI.redisForTimelines,
	useFactory: (config: Config) => {
		return createRedisForTimelines(config);
	},
	inject: [DI.config],
};

const $redisForReactions: Provider = {
	provide: DI.redisForReactions,
	useFactory: (config: Config) => {
		return createRedisForReactions(config);
	},
	inject: [DI.config],
};

const $meta: Provider = {
	provide: DI.meta,
	useFactory: async (db: MiDrizzleDatabase, redisForSub: Redis.Redis) => {
		return fetchReactiveMeta(db, redisForSub);
	},
	inject: [DI.drizzle, DI.redisForSub],
};

@Global()
@Module({
	imports: [],
	providers: [$config, $drizzlePool, $drizzle, $meta, $meilisearch, $redis, $redisForPub, $redisForSub, $redisForTimelines, $redisForReactions],
	exports: [$config, $drizzlePool, $drizzle, $meta, $meilisearch, $redis, $redisForPub, $redisForSub, $redisForTimelines, $redisForReactions],
})
export class GlobalModule implements OnApplicationShutdown {
	constructor(
		@Inject(DI.drizzlePool) private drizzlePool: MiDrizzlePool,
		@Inject(DI.redis) private redisClient: Redis.Redis,
		@Inject(DI.redisForPub) private redisForPub: Redis.Redis,
		@Inject(DI.redisForSub) private redisForSub: Redis.Redis,
		@Inject(DI.redisForTimelines) private redisForTimelines: Redis.Redis,
		@Inject(DI.redisForReactions) private redisForReactions: Redis.Redis,
	) { }

	public async dispose(): Promise<void> {
		await disposeRuntimeResources({
			drizzlePool: this.drizzlePool,
			redis: this.redisClient,
			redisForPub: this.redisForPub,
			redisForSub: this.redisForSub,
			redisForTimelines: this.redisForTimelines,
			redisForReactions: this.redisForReactions,
		});
	}

	async onApplicationShutdown(signal: string): Promise<void> {
		await this.dispose();
	}
}
