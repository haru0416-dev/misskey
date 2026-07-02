/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type Logger from '@/logger.js';
import { DriveService } from '@/core/DriveService.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiNote } from '@/models/Note.js';
import { EmailService } from '@/core/EmailService.js';
import { bindThis } from '@/decorators.js';
import { SearchService } from '@/core/SearchService.js';
import { PageService } from '@/core/PageService.js';
import { listPagesByUserIdWithPaginationFromDatabase } from '@/core/PageStore.js';
import { listDriveFilesByUserIdWithPaginationFromDatabase } from '@/core/DriveFileStore.js';
import { deleteNotesByIdsFromDatabase, listNotesByUserIdWithPaginationFromDatabase } from '@/core/NoteStore.js';
import { deleteUserByIdFromDatabase, fetchUserByIdFromDatabase } from '@/core/UserStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/UserProfileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { DbUserDeleteJobData } from '../types.js';

@Injectable()
export class DeleteAccountProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private driveService: DriveService,
		private pageService: PageService,
		private emailService: EmailService,
		private queueLoggerService: QueueLoggerService,
		private searchService: SearchService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('delete-account');
	}

	@bindThis
	public async process(job: Bull.Job<DbUserDeleteJobData>): Promise<string | void> {
		this.logger.info(`Deleting account of ${job.data.user.id} ...`);

		const user = await fetchUserByIdFromDatabase(this.drizzle, job.data.user.id);
		if (user == null) {
			return;
		}

		{ // Delete notes
			let cursor: MiNote['id'] | null = null;

			while (true) {
				const notes = await listNotesByUserIdWithPaginationFromDatabase(this.drizzle, user.id, {
					limit: 100,
					sinceId: cursor,
				});

				if (notes.length === 0) {
					break;
				}

				cursor = notes.at(-1)?.id ?? null;

				await deleteNotesByIdsFromDatabase(this.drizzle, notes.map(note => note.id));

				for (const note of notes) {
					await this.searchService.unindexNote(note);
				}
			}

			this.logger.succ('All of notes deleted');
		}

		{ // Delete files
			let cursor: MiDriveFile['id'] | null = null;

			while (true) {
				const files = await listDriveFilesByUserIdWithPaginationFromDatabase(this.drizzle, user.id, {
					limit: 10,
					sinceId: cursor,
				});

				if (files.length === 0) {
					break;
				}

				cursor = files.at(-1)?.id ?? null;

				for (const file of files) {
					await this.driveService.deleteFileSync(file);
				}
			}

			this.logger.succ('All of files deleted');
		}

		{
			// delete pages. Necessary for decrementing pageCount of notes.
			while (true) {
				const pages = await listPagesByUserIdWithPaginationFromDatabase(this.drizzle, user.id, {
					limit: 100,
					order: 'asc',
				});

				if (pages.length === 0) {
					break;
				}
				for (const page of pages) {
					await this.pageService.delete(user, page.id);
				}
			}
		}

		{ // Send email notification
			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(this.drizzle, user.id);
			if (profile.email && profile.emailVerified) {
				this.emailService.sendEmail(profile.email, 'Account deleted',
					'Your account has been deleted.',
					'Your account has been deleted.');
			}
		}

		// soft指定されている場合は物理削除しない
		if (job.data.soft) {
		// nop
		} else {
			await deleteUserByIdFromDatabase(this.drizzle, job.data.user.id);
		}

		return 'Account deleted';
	}
}
