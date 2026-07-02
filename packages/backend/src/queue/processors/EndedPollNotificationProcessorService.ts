/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type Logger from '@/logger.js';
import { CacheService } from '@/core/CacheService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { bindThis } from '@/decorators.js';
import { fetchNoteByIdFromDatabase } from '@/core/NoteStore.js';
import { listLocalPollVoterIdsByNoteIdFromDatabase } from '@/core/PollVoteStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { EndedPollNotificationJobData } from '../types.js';

@Injectable()
export class EndedPollNotificationProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private cacheService: CacheService,
		private notificationService: NotificationService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('ended-poll-notification');
	}

	@bindThis
	public async process(job: Bull.Job<EndedPollNotificationJobData>): Promise<void> {
		const note = await fetchNoteByIdFromDatabase(this.db, job.data.noteId);
		if (note == null || !note.hasPoll) {
			return;
		}

		const voterIds = await listLocalPollVoterIdsByNoteIdFromDatabase(this.db, note.id);
		const userIds = [...new Set([note.userId, ...voterIds])];

		for (const userId of userIds) {
			const profile = await this.cacheService.userProfileCache.fetch(userId);
			if (profile.userHost === null) {
				this.notificationService.createNotification(userId, 'pollEnded', {
					noteId: note.id,
				});
			}
		}
	}
}
