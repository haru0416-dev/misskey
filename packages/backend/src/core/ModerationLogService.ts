/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { MiUser } from '@/models/User.js';
import { IdService } from '@/core/IdService.js';
import { bindThis } from '@/decorators.js';
import { createModerationLogInDatabase } from '@/core/ModerationLogStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { ModerationLogPayloads } from '@/types.js';
import { moderationLogTypes } from '@/types.js';

@Injectable()
export class ModerationLogService {
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private idService: IdService,
	) {
	}

	@bindThis
	public async log<T extends typeof moderationLogTypes[number]>(moderator: { id: MiUser['id'] }, type: T, info?: ModerationLogPayloads[T]) {
		await createModerationLogInDatabase(this.drizzle, {
			id: this.idService.gen(),
			userId: moderator.id,
			type: type,
			info: (info as any) ?? {},
		});
	}
}
