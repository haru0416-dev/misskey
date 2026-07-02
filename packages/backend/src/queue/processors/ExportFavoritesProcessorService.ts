/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { Inject, Injectable } from '@nestjs/common';
import { format as dateFormat } from 'date-fns';
import { DI } from '@/di-symbols.js';
import type { MiUser } from '@/models/_.js';
import type Logger from '@/logger.js';
import { DriveService } from '@/core/DriveService.js';
import { createTemp } from '@/misc/create-temp.js';
import type { MiPoll } from '@/models/Poll.js';
import type { MiNote } from '@/models/Note.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { shouldHideNoteByTime } from '@/misc/should-hide-note-by-time.js';
import {
	countNoteFavoritesByUserIdFromDatabase,
	listNoteFavoritesByUserIdFromDatabase,
} from '@/core/NoteFavoriteStore.js';
import { fetchPollByNoteIdOrFailFromDatabase } from '@/core/PollStore.js';
import { listVisibleNotesWithUsersByIdsFromDatabase } from '@/core/NoteStore.js';
import { fetchUserByIdFromDatabase } from '@/core/UserStore.js';
import type { NoteFavoriteRow } from '@/db/schema/note-favorite.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { DbJobDataWithUser } from '../types.js';

@Injectable()
export class ExportFavoritesProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private driveService: DriveService,
		private queueLoggerService: QueueLoggerService,
		private idService: IdService,
		private notificationService: NotificationService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('export-favorites');
	}

	@bindThis
	public async process(job: Bull.Job<DbJobDataWithUser>): Promise<void> {
		this.logger.info(`Exporting favorites of ${job.data.user.id} ...`);

		const user = await fetchUserByIdFromDatabase(this.db, job.data.user.id);
		if (user == null) {
			return;
		}

		// Create temp file
		const [path, cleanup] = await createTemp();

		this.logger.info(`Temp file is ${path}`);

		try {
			const stream = fs.createWriteStream(path, { flags: 'a' });

			const write = (text: string): Promise<void> => {
				return new Promise<void>((res, rej) => {
					stream.write(text, err => {
						if (err) {
							this.logger.error(err);
							rej(err);
						} else {
							res();
						}
					});
				});
			};

			await write('[');

			let exportedFavoritesCount = 0;
			let cursor: NoteFavoriteRow['id'] | null = null;

			const total = await countNoteFavoritesByUserIdFromDatabase(this.db, user.id);

			while (true) {
				const favorites = await listNoteFavoritesByUserIdFromDatabase(this.db, user.id, {
					limit: 100,
					order: 'asc',
					sinceId: cursor,
				});

				if (favorites.length === 0) {
					job.updateProgress(100);
					break;
				}

				cursor = favorites.at(-1)?.id ?? null;
				const noteIds = favorites.map(favorite => favorite.noteId);
				const notes = await listVisibleNotesWithUsersByIdsFromDatabase(this.db, noteIds, { id: user.id });
				const noteMap = new Map(notes.map(note => [note.id, note]));

				for (const favorite of favorites) {
					const note = noteMap.get(favorite.noteId);
					if (note == null) {
						continue;
					}

					const noteCreatedAt = this.idService.parse(note.id).date;
					if (shouldHideNoteByTime(note.user.makeNotesHiddenBefore, noteCreatedAt)) {
						continue;
					}

					let poll: MiPoll | undefined;
					if (note.hasPoll) {
						poll = await fetchPollByNoteIdOrFailFromDatabase(this.db, note.id);
					}
					const content = JSON.stringify(this.serialize({
						...favorite,
						note,
					}, poll));
					const isFirst = exportedFavoritesCount === 0;
					await write(isFirst ? content : ',\n' + content);
					exportedFavoritesCount++;
				}

				job.updateProgress(exportedFavoritesCount / total * 100);
			}

			await write(']');

			stream.end();
			this.logger.succ(`Exported to: ${path}`);

			const fileName = 'favorites-' + dateFormat(new Date(), 'yyyy-MM-dd-HH-mm-ss') + '.json';
			const driveFile = await this.driveService.addFile({ user, path, name: fileName, force: true, ext: 'json' });

			this.logger.succ(`Exported to: ${driveFile.id}`);

			this.notificationService.createNotification(user.id, 'exportCompleted', {
				exportedEntity: 'favorite',
				fileId: driveFile.id,
			});
		} finally {
			cleanup();
		}
	}

	private serialize(favorite: NoteFavoriteRow & { note: MiNote & { user: MiUser } }, poll: MiPoll | null = null): Record<string, unknown> {
		return {
			id: favorite.id,
			createdAt: this.idService.parse(favorite.id).date.toISOString(),
			note: {
				id: favorite.note.id,
				text: favorite.note.text,
				createdAt: this.idService.parse(favorite.note.id).date.toISOString(),
				fileIds: favorite.note.fileIds,
				replyId: favorite.note.replyId,
				renoteId: favorite.note.renoteId,
				poll: poll,
				cw: favorite.note.cw,
				visibility: favorite.note.visibility,
				visibleUserIds: favorite.note.visibleUserIds,
				localOnly: favorite.note.localOnly,
				reactionAcceptance: favorite.note.reactionAcceptance,
				uri: favorite.note.uri,
				url: favorite.note.url,
				user: {
					id: favorite.note.user.id,
					name: favorite.note.user.name,
					username: favorite.note.user.username,
					host: favorite.note.user.host,
					uri: favorite.note.user.uri,
				},
			},
		};
	}
}
