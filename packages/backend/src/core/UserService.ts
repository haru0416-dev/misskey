/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { MiUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { updateFollowerHibernatedStateByFollowerIdInDatabase } from '@/core/FollowingStore.js';
import {
	updateUserHibernatedStateInDatabase,
	updateUserLastActiveDateInDatabase,
	updateUserLastActiveDateReturningWasHibernatedInDatabase,
} from '@/core/UserStore.js';
import { bindThis } from '@/decorators.js';
import { SystemWebhookService } from '@/core/SystemWebhookService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';

@Injectable()
export class UserService {
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private systemWebhookService: SystemWebhookService,
		private userEntityService: UserEntityService,
	) {
	}

	@bindThis
	public async updateLastActiveDate(user: MiUser): Promise<void> {
		if (user.isHibernated) {
			const wokeUp = await updateUserLastActiveDateReturningWasHibernatedInDatabase(this.db, user.id, new Date());
			if (wokeUp) {
				updateUserHibernatedStateInDatabase(this.db, user.id, false);
				updateFollowerHibernatedStateByFollowerIdInDatabase(this.db, user.id, false);
			}
		} else {
			updateUserLastActiveDateInDatabase(this.db, user.id, new Date());
		}
	}

	/**
	 * SystemWebhookを用いてユーザに関する操作内容を管理者各位に通知する.
	 * ここではJobQueueへのエンキューのみを行うため、即時実行されない.
	 *
	 * @see SystemWebhookService.enqueueSystemWebhook
	 */
	@bindThis
	public async notifySystemWebhook(user: MiUser, type: 'userCreated') {
		const packedUser = await this.userEntityService.pack(user, null, { schema: 'UserLite' });
		return this.systemWebhookService.enqueueSystemWebhook(type, packedUser);
	}
}
