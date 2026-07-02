/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { Inject, Injectable } from '@nestjs/common';
import { format as dateFormat } from 'date-fns';
import { DI } from '@/di-symbols.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { listFollowingsByFollowerIdFromDatabase } from '@/core/FollowingStore.js';
import { listMuteeIdsByMuterIdFromDatabase } from '@/core/MutingStore.js';
import { fetchUserByIdFromDatabase } from '@/core/UserStore.js';
import type Logger from '@/logger.js';
import { DriveService } from '@/core/DriveService.js';
import { createTemp } from '@/misc/create-temp.js';
import type { MiFollowing } from '@/models/Following.js';
import { UtilityService } from '@/core/UtilityService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { bindThis } from '@/decorators.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { DbExportFollowingData } from '../types.js';

@Injectable()
export class ExportFollowingProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private utilityService: UtilityService,
		private driveService: DriveService,
		private queueLoggerService: QueueLoggerService,
		private notificationService: NotificationService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('export-following');
	}

	@bindThis
	public async process(job: Bull.Job<DbExportFollowingData>): Promise<void> {
		this.logger.info(`Exporting following of ${job.data.user.id} ...`);

		const user = await fetchUserByIdFromDatabase(this.db, job.data.user.id);
		if (user == null) {
			return;
		}

		// Create temp file
		const [path, cleanup] = await createTemp();

		this.logger.info(`Temp file is ${path}`);

		try {
			const stream = fs.createWriteStream(path, { flags: 'a' });

			let cursor: MiFollowing['id'] | null = null;

			const mutingUserIds = job.data.excludeMuting ? await listMuteeIdsByMuterIdFromDatabase(this.db, user.id) : [];

			while (true) {
				const followings = await listFollowingsByFollowerIdFromDatabase(this.db, user.id, {
					limit: 100,
					sinceId: cursor,
					excludeFolloweeIds: mutingUserIds,
				});

				if (followings.length === 0) {
					break;
				}

				cursor = followings.at(-1)?.id ?? null;

				for (const following of followings) {
					const u = await fetchUserByIdFromDatabase(this.db, following.followeeId);
					if (u == null) {
						continue;
					}

					if (job.data.excludeInactive && u.updatedAt && (Date.now() - u.updatedAt.getTime() > 1000 * 60 * 60 * 24 * 90)) {
						continue;
					}

					const userAcct = this.utilityService.getFullApAccount(u.username, u.host);
					const content = `${userAcct},withReplies=${following.withReplies}`;
					await new Promise<void>((res, rej) => {
						stream.write(content + '\n', err => {
							if (err) {
								this.logger.error(err);
								rej(err);
							} else {
								res();
							}
						});
					});
				}
			}

			stream.end();
			this.logger.succ(`Exported to: ${path}`);

			const fileName = 'following-' + dateFormat(new Date(), 'yyyy-MM-dd-HH-mm-ss') + '.csv';
			const driveFile = await this.driveService.addFile({ user, path, name: fileName, force: true, ext: 'csv' });

			this.logger.succ(`Exported to: ${driveFile.id}`);

			this.notificationService.createNotification(user.id, 'exportCompleted', {
				exportedEntity: 'following',
				fileId: driveFile.id,
			});
		} finally {
			cleanup();
		}
	}
}
