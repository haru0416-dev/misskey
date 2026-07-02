/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { deepClone } from '@/misc/clone.js';
import { IdService } from '@/core/IdService.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';
import {
	createRetentionAggregationInDatabase,
	listActiveLocalUserIdsAfter,
	listLocalUserIdsCreatedAfter,
	listRetentionAggregationsCreatedAfter,
	updateRetentionAggregationDataInDatabase,
} from '@/core/RetentionAggregationStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';

@Injectable()
export class AggregateRetentionProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private idService: IdService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('aggregate-retention');
	}

	@bindThis
	public async process(): Promise<void> {
		this.logger.info('Aggregating retention...');

		const now = new Date();
		const dateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

		// 過去(だいたい)30日分のレコードを取得
		const pastRecords = await listRetentionAggregationsCreatedAfter(this.drizzle, new Date(Date.now() - (1000 * 60 * 60 * 24 * 31)));

		// 今日登録したユーザーを全て取得
		const targetUserIds = await listLocalUserIdsCreatedAfter(this.drizzle, this.idService.gen(Date.now() - (1000 * 60 * 60 * 24)));

		try {
			await createRetentionAggregationInDatabase(this.drizzle, {
				id: this.idService.gen(),
				createdAt: now,
				updatedAt: now,
				dateKey,
				userIds: targetUserIds,
				usersCount: targetUserIds.length,
			});
		} catch (err) {
			if (isDuplicateKeyValueError(err)) {
				this.logger.succ('Skip because it has already been processed by another worker.');
				return;
			}
			throw err;
		}

		// 今日活動したユーザーを全て取得
		const activeUsersIds = await listActiveLocalUserIdsAfter(this.drizzle, new Date(Date.now() - (1000 * 60 * 60 * 24)));

		for (const record of pastRecords) {
			const retention = record.userIds.filter(id => activeUsersIds.includes(id)).length;

			const data = deepClone(record.data);
			data[dateKey] = retention;

			await updateRetentionAggregationDataInDatabase(this.drizzle, record.id, data, now);
		}

		this.logger.succ('Retention aggregated.');
	}
}
