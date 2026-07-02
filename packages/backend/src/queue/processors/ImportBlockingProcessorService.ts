/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { fetchUserByIdFromDatabase, fetchUserByUsernameAndHostFromDatabase } from '@/core/UserStore.js';
import { fetchDriveFileByIdFromDatabase } from '@/core/DriveFileStore.js';
import type Logger from '@/logger.js';
import * as Acct from '@/misc/acct.js';
import { RemoteUserResolveService } from '@/core/RemoteUserResolveService.js';
import { DownloadService } from '@/core/DownloadService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { bindThis } from '@/decorators.js';
import { QueueService } from '@/core/QueueService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { DbUserImportJobData, DbUserImportToDbJobData } from '../types.js';

@Injectable()
export class ImportBlockingProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private queueService: QueueService,
		private utilityService: UtilityService,
		private remoteUserResolveService: RemoteUserResolveService,
		private downloadService: DownloadService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('import-blocking');
	}

	@bindThis
	public async process(job: Bull.Job<DbUserImportJobData>): Promise<void> {
		this.logger.info(`Importing blocking of ${job.data.user.id} ...`);

		const user = await fetchUserByIdFromDatabase(this.db, job.data.user.id);
		if (user == null) {
			return;
		}

		const file = await fetchDriveFileByIdFromDatabase(this.db, job.data.fileId);
		if (file == null) {
			return;
		}

		const csv = await this.downloadService.downloadTextFile(file.url);
		const targets = csv.trim().split('\n');
		this.queueService.createImportBlockingToDbJob({ id: user.id }, targets);

		this.logger.succ('Import jobs created');
	}

	@bindThis
	public async processDb(job: Bull.Job<DbUserImportToDbJobData>): Promise<void> {
		const line = job.data.target;
		const user = job.data.user;

		try {
			const acct = line.split(',')[0].trim();
			const { username, host } = Acct.parse(acct);

			if (!host) return;

			let target = await fetchUserByUsernameAndHostFromDatabase(
				this.db,
				username,
				this.utilityService.isSelfHost(host) ? null : this.utilityService.toPuny(host),
			);

			if (host == null && target == null) return;

			if (target == null) {
				target = await this.remoteUserResolveService.resolveUser(username, host);
			}

			if (target == null) {
				throw new Error(`Unable to resolve user: @${username}@${host}`);
			}

			// skip myself
			if (target.id === job.data.user.id) return;

			this.logger.info(`Block ${target.id} ...`);

			this.queueService.createBlockJob([{ from: { id: user.id }, to: { id: target.id }, silent: true }]);
		} catch (e) {
			this.logger.warn(`Error: ${e}`);
		}
	}
}
