/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { MiUser } from '@/models/User.js';
import { bindThis } from '@/decorators.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { ModerationLogPayloads } from '@/types.js';
import { moderationLogTypes } from '@/types.js';
import type { Config } from '@/config.js';
import { logModerationEventInDatabase } from './ModerationLogLogic.js';

@Injectable()
export class ModerationLogService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,
	) {
	}

	@bindThis
	public async log<T extends typeof moderationLogTypes[number]>(moderator: { id: MiUser['id'] }, type: T, info?: ModerationLogPayloads[T]) {
		await logModerationEventInDatabase({ config: this.config, db: this.drizzle }, moderator, type, info);
	}
}
