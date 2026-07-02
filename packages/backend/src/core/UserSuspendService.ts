/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { MiUser } from '@/models/User.js';
import { QueueService } from '@/core/QueueService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { DI } from '@/di-symbols.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { bindThis } from '@/decorators.js';
import { RelationshipJobData } from '@/queue/types.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { deleteFollowRequestsByFolloweeIdFromDatabase, deleteFollowRequestsByFollowerIdFromDatabase } from '@/core/FollowRequestStore.js';
import { listFollowingsForUnfollowByFollowerIdFromDatabase, listSharedInboxesFromFollowingsInDatabase } from '@/core/FollowingStore.js';
import { updateUserSuspendedStateInDatabase } from '@/core/UserStore.js';

@Injectable()
export class UserSuspendService {
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private userEntityService: UserEntityService,
		private queueService: QueueService,
		private globalEventService: GlobalEventService,
		private apRendererService: ApRendererService,
		private moderationLogService: ModerationLogService,
	) {
	}

	@bindThis
	public async suspend(user: MiUser, moderator: MiUser): Promise<void> {
		await updateUserSuspendedStateInDatabase(this.db, user.id, true);

		this.moderationLogService.log(moderator, 'suspend', {
			userId: user.id,
			userUsername: user.username,
			userHost: user.host,
		});

		(async () => {
			await this.postSuspend(user).catch(_ => {});
			await this.unFollowAll(user).catch(_ => {});
		})();
	}

	@bindThis
	public async unsuspend(user: MiUser, moderator: MiUser): Promise<void> {
		await updateUserSuspendedStateInDatabase(this.db, user.id, false);

		this.moderationLogService.log(moderator, 'unsuspend', {
			userId: user.id,
			userUsername: user.username,
			userHost: user.host,
		});

		(async () => {
			await this.postUnsuspend(user).catch(_ => {});
		})();
	}

	@bindThis
	private async postSuspend(user: { id: MiUser['id']; host: MiUser['host'] }): Promise<void> {
		this.globalEventService.publishInternalEvent('userChangeSuspendedState', { id: user.id, isSuspended: true });

		deleteFollowRequestsByFolloweeIdFromDatabase(this.db, user.id);
		deleteFollowRequestsByFollowerIdFromDatabase(this.db, user.id);

		if (this.userEntityService.isLocalUser(user)) {
			// 知り得る全SharedInboxにDelete配信
			const content = this.apRendererService.addContext(this.apRendererService.renderDelete(this.userEntityService.genLocalUserUri(user.id), user));

			const queue = await listSharedInboxesFromFollowingsInDatabase(this.db);

			for (const inbox of queue) {
				this.queueService.deliver(user, content, inbox, true);
			}
		}
	}

	@bindThis
	private async postUnsuspend(user: MiUser): Promise<void> {
		this.globalEventService.publishInternalEvent('userChangeSuspendedState', { id: user.id, isSuspended: false });

		if (this.userEntityService.isLocalUser(user)) {
			// 知り得る全SharedInboxにUndo Delete配信
			const content = this.apRendererService.addContext(this.apRendererService.renderUndo(this.apRendererService.renderDelete(this.userEntityService.genLocalUserUri(user.id), user), user));

			const queue = await listSharedInboxesFromFollowingsInDatabase(this.db);

			for (const inbox of queue) {
				this.queueService.deliver(user as any, content, inbox, true);
			}
		}
	}

	@bindThis
	private async unFollowAll(follower: MiUser) {
		const followings = await listFollowingsForUnfollowByFollowerIdFromDatabase(this.db, follower.id);

		const jobs: RelationshipJobData[] = [];
		for (const following of followings) {
			jobs.push({
				from: { id: following.followerId },
				to: { id: following.followeeId },
				silent: true,
			});
		}
		this.queueService.createUnfollowJob(jobs);
	}
}
