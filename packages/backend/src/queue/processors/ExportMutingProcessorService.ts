/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { Inject, Injectable } from '@nestjs/common';
import { format as dateFormat } from 'date-fns';
import { DI } from '@/di-symbols.js';
import type { MiMuting } from '@/models/_.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { countMutingsByMuterIdFromDatabase, listPermanentMutingsByMuterIdFromDatabase } from '@/core/MutingStore.js';
import { fetchUserByIdFromDatabase } from '@/core/UserStore.js';
import type Logger from '@/logger.js';
import { DriveService } from '@/core/DriveService.js';
import { createTemp } from '@/misc/create-temp.js';
import { UtilityService } from '@/core/UtilityService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { bindThis } from '@/decorators.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { DbJobDataWithUser } from '../types.js';

@Injectable()
export class ExportMutingProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private utilityService: UtilityService,
		private driveService: DriveService,
		private queueLoggerService: QueueLoggerService,
		private notificationService: NotificationService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('export-muting');
	}

	@bindThis
	public async process(job: Bull.Job<DbJobDataWithUser>): Promise<void> {
		this.logger.info(`Exporting muting of ${job.data.user.id} ...`);

		const user = await fetchUserByIdFromDatabase(this.db, job.data.user.id);
		if (user == null) {
			return;
		}

		// Create temp file
		const [path, cleanup] = await createTemp();

		this.logger.info(`Temp file is ${path}`);

		try {
			const stream = fs.createWriteStream(path, { flags: 'a' });

			let exportedCount = 0;
			let cursor: MiMuting['id'] | null = null;

			const total = await countMutingsByMuterIdFromDatabase(this.db, user.id);

			while (true) {
				const mutes = await listPermanentMutingsByMuterIdFromDatabase(this.db, user.id, {
					limit: 100,
					sinceId: cursor,
				});

				if (mutes.length === 0) {
					job.updateProgress(100);
					break;
				}

				cursor = mutes.at(-1)?.id ?? null;

				for (const mute of mutes) {
					const u = await fetchUserByIdFromDatabase(this.db, mute.muteeId);
					if (u == null) {
						exportedCount++; continue;
					}

					const content = this.utilityService.getFullApAccount(u.username, u.host);
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
					exportedCount++;
				}

				job.updateProgress(exportedCount / total * 100);
			}

			stream.end();
			this.logger.succ(`Exported to: ${path}`);

			const fileName = 'mute-' + dateFormat(new Date(), 'yyyy-MM-dd-HH-mm-ss') + '.csv';
			const driveFile = await this.driveService.addFile({ user, path, name: fileName, force: true, ext: 'csv' });

			this.logger.succ(`Exported to: ${driveFile.id}`);

			this.notificationService.createNotification(user.id, 'exportCompleted', {
				exportedEntity: 'muting',
				fileId: driveFile.id,
			});
		} finally {
			cleanup();
		}
	}
}
