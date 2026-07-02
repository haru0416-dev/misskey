/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import * as Redis from 'ioredis';
import type { MiInstance } from '@/models/Instance.js';
import { MemoryKVCache, RedisKVCache } from '@/misc/cache.js';
import { IdService } from '@/core/IdService.js';
import { DI } from '@/di-symbols.js';
import { UtilityService } from '@/core/UtilityService.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { createInstanceInDatabase, fetchInstanceByHostFromDatabase, updateInstanceInDatabase } from '@/core/InstanceStore.js';
import { bindThis } from '@/decorators.js';

@Injectable()
export class FederatedInstanceService implements OnApplicationShutdown {
	public federatedInstanceCache: RedisKVCache<MiInstance | null>;

	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private utilityService: UtilityService,
		private idService: IdService,
	) {
		this.federatedInstanceCache = new RedisKVCache<MiInstance | null>(this.redisClient, 'federatedInstance', {
			lifetime: 1000 * 60 * 30, // 30m
			memoryCacheLifetime: 1000 * 60 * 3, // 3m
			fetcher: (key) => fetchInstanceByHostFromDatabase(this.db, key),
			toRedisConverter: (value) => JSON.stringify(value),
			fromRedisConverter: (value) => {
				const parsed = JSON.parse(value);
				if (parsed == null) return null;
				return {
					...parsed,
					firstRetrievedAt: new Date(parsed.firstRetrievedAt),
					latestRequestReceivedAt: parsed.latestRequestReceivedAt ? new Date(parsed.latestRequestReceivedAt) : null,
					infoUpdatedAt: parsed.infoUpdatedAt ? new Date(parsed.infoUpdatedAt) : null,
					notRespondingSince: parsed.notRespondingSince ? new Date(parsed.notRespondingSince) : null,
				};
			},
		});
	}

	@bindThis
	public async fetchOrRegister(host: string): Promise<MiInstance> {
		host = this.utilityService.toPuny(host);

		const cached = await this.federatedInstanceCache.get(host);
		if (cached) return cached;

		const index = await fetchInstanceByHostFromDatabase(this.db, host);

		if (index == null) {
			const i = await createInstanceInDatabase(this.db, {
				id: this.idService.gen(),
				host,
				firstRetrievedAt: new Date(),
			});

			this.federatedInstanceCache.set(host, i);
			return i;
		} else {
			this.federatedInstanceCache.set(host, index);
			return index;
		}
	}

	@bindThis
	public async fetch(host: string): Promise<MiInstance | null> {
		host = this.utilityService.toPuny(host);

		const cached = await this.federatedInstanceCache.get(host);
		if (cached !== undefined) return cached;

		const index = await fetchInstanceByHostFromDatabase(this.db, host);

		if (index == null) {
			this.federatedInstanceCache.set(host, null);
			return null;
		} else {
			this.federatedInstanceCache.set(host, index);
			return index;
		}
	}

	@bindThis
	public async update(id: MiInstance['id'], data: Partial<MiInstance>): Promise<void> {
		const result = await updateInstanceInDatabase(this.db, id, data);

		this.federatedInstanceCache.set(result.host, result);
	}

	@bindThis
	public dispose(): void {
		this.federatedInstanceCache.dispose();
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
