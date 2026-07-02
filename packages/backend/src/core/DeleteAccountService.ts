/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { MiMeta, MiUser } from '@/models/_.js';
import type { Config } from '@/config.js';
import { QueueService } from '@/core/QueueService.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { deleteAccountWithSideEffects } from '@/core/DeleteAccountLogic.js';

@Injectable()
export class DeleteAccountService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private queueService: QueueService,
		private globalEventService: GlobalEventService,
	) {
	}

	@bindThis
	public async deleteAccount(user: {
		id: string;
		host: string | null;
	}, moderator?: MiUser): Promise<void> {
		await deleteAccountWithSideEffects({
			config: this.config,
			meta: this.meta,
			db: this.db,
			dbQueue: this.queueService.dbQueue,
			deliverQueue: this.queueService.deliverQueue,
			publishInternalEvent: (type, value) => this.globalEventService.publishInternalEvent(type, value),
		}, user, moderator);
	}
}
