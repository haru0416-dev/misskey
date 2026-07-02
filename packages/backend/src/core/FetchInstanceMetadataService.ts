/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import type { MiInstance } from '@/models/Instance.js';
import type Logger from '@/logger.js';
import { DI } from '@/di-symbols.js';
import { LoggerService } from '@/core/LoggerService.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { bindThis } from '@/decorators.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import { fetchInstanceMetadataWithSideEffects } from '@/core/FetchInstanceMetadataLogic.js';

@Injectable()
export class FetchInstanceMetadataService {
	private logger: Logger;

	constructor(
		private httpRequestService: HttpRequestService,
		private loggerService: LoggerService,
		private federatedInstanceService: FederatedInstanceService,
		@Inject(DI.redis)
		private redisClient: Redis.Redis,
	) {
		this.logger = this.loggerService.getLogger('metadata', 'cyan');
	}

	@bindThis
	// public for test
	public async tryLock(host: string): Promise<string | null> {
		// TODO: マイグレーションなのであとで消す (2024.3.1)
		this.redisClient.del(`fetchInstanceMetadata:mutex:${host}`);

		return await this.redisClient.set(
			`fetchInstanceMetadata:mutex:v2:${host}`, '1',
			'EX', 30, // 30秒したら自動でロック解除 https://github.com/misskey-dev/misskey/issues/13506#issuecomment-1975375395
			'GET', // 古い値を返す（なかったらnull）
		);
	}

	@bindThis
	// public for test
	public unlock(host: string): Promise<number> {
		return this.redisClient.del(`fetchInstanceMetadata:mutex:v2:${host}`);
	}

	@bindThis
	public async fetchInstanceMetadata(instance: MiInstance, force = false): Promise<void> {
		await fetchInstanceMetadataWithSideEffects({
			httpRequestService: this.httpRequestService,
			logger: this.logger,
			tryLock: host => this.tryLock(host),
			unlock: host => this.unlock(host),
			fetchOrRegisterInstance: host => this.federatedInstanceService.fetchOrRegister(host),
			updateInstance: (id, updates) => this.federatedInstanceService.update(id, updates),
		}, instance, force);
	}
}
