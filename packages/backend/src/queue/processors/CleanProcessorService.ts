/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { LessThan } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { AntennasRepository } from '@/models/_.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import type { Config } from '@/config.js';
import { deleteUserIpsOlderThanFromDatabase } from '@/core/UserIpStore.js';
import { deleteExpiredRoleAssignmentsFromDatabase } from '@/core/RoleAssignmentStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';

@Injectable()
export class CleanProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		@Inject(DI.antennasRepository)
		private antennasRepository: AntennasRepository,

		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('clean');
	}

	@bindThis
	public async process(): Promise<void> {
		this.logger.info('Cleaning...');

		await deleteUserIpsOlderThanFromDatabase(this.drizzle, new Date(Date.now() - (1000 * 60 * 60 * 24 * 90)));

		// 使われてないアンテナを停止
		if (this.config.deactivateAntennaThreshold > 0) {
			this.antennasRepository.update({
				lastUsedAt: LessThan(new Date(Date.now() - this.config.deactivateAntennaThreshold)),
			}, {
				isActive: false,
			});
		}

		await deleteExpiredRoleAssignmentsFromDatabase(this.drizzle, new Date());

		this.logger.succ('Cleaned.');
	}
}
