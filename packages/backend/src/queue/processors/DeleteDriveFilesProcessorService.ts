/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { MiDriveFile } from '@/models/_.js';
import type Logger from '@/logger.js';
import { DriveService } from '@/core/DriveService.js';
import { bindThis } from '@/decorators.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { countDriveFilesByUserIdFromDatabase, listDriveFilesByUserIdWithPaginationFromDatabase } from '@/core/DriveFileStore.js';
import { fetchUserByIdFromDatabase } from '@/core/UserStore.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { DbJobDataWithUser } from '../types.js';

@Injectable()
export class DeleteDriveFilesProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private driveService: DriveService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('delete-drive-files');
	}

	@bindThis
	public async process(job: Bull.Job<DbJobDataWithUser>): Promise<void> {
		this.logger.info(`Deleting drive files of ${job.data.user.id} ...`);

		const user = await fetchUserByIdFromDatabase(this.db, job.data.user.id);
		if (user == null) {
			return;
		}

		let deletedCount = 0;
		let cursor: MiDriveFile['id'] | null = null;

		const total = await countDriveFilesByUserIdFromDatabase(this.db, user.id);

		while (true) {
			const files = await listDriveFilesByUserIdWithPaginationFromDatabase(this.db, user.id, {
				limit: 100,
				sinceId: cursor,
			});

			if (files.length === 0) {
				job.updateProgress(100);
				break;
			}

			cursor = files.at(-1)?.id ?? null;

			for (const file of files) {
				await this.driveService.deleteFileSync(file);
				deletedCount++;
			}

			job.updateProgress(deletedCount / total * 100);
		}

		this.logger.succ(`All drive files (${deletedCount}) of ${user.id} has been deleted.`);
	}
}
