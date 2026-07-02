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
import { countRemoteCachedDriveFilesFromDatabase, listRemoteCachedDriveFilesWithPaginationFromDatabase } from '@/core/DriveFileStore.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';

@Injectable()
export class CleanRemoteFilesProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private driveService: DriveService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('clean-remote-files');
	}

	@bindThis
	public async process(job: Bull.Job<Record<string, unknown>>): Promise<void> {
		this.logger.info('Deleting cached remote files...');

		let deletedCount = 0;
		let cursor: MiDriveFile['id'] | null = null;

		const total = await countRemoteCachedDriveFilesFromDatabase(this.db);

		while (true) {
			const files = await listRemoteCachedDriveFilesWithPaginationFromDatabase(this.db, {
				limit: 8,
				sinceId: cursor,
			});

			if (files.length === 0) {
				job.updateProgress(100);
				break;
			}

			cursor = files.at(-1)?.id ?? null;

			await Promise.all(files.map(file => this.driveService.deleteFileSync(file, true)));

			deletedCount += 8;

			job.updateProgress(deletedCount * total / 100);
		}

		this.logger.succ('All cached remote files has been deleted.');
	}
}
