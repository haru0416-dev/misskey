/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Bull from 'bullmq';
import { countDriveFilesByUserIdFromDatabase, listDriveFilesByUserIdWithPaginationFromDatabase } from '@/core/DriveFileStore.js';
import { fetchUserByIdFromDatabase } from '@/core/UserStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { DbJobDataWithUser } from '@/queue/types.js';
import { deleteFileSyncForHonoApi, type HonoQueueObjectStorageDependencies } from './hono-queue-object-storage.js';

export type HonoQueueDbDependencies = HonoQueueObjectStorageDependencies & {
	db: MiDrizzleDatabase;
};

/** DeleteDriveFilesProcessorService.process 相当。 */
export async function handleHonoQueueDeleteDriveFiles(deps: HonoQueueDbDependencies, job: Bull.Job<DbJobDataWithUser>): Promise<void> {
	const user = await fetchUserByIdFromDatabase(deps.db, job.data.user.id);
	if (user == null) {
		return;
	}

	let deletedCount = 0;
	let cursor: MiDriveFile['id'] | null = null;

	const total = await countDriveFilesByUserIdFromDatabase(deps.db, user.id);

	for (;;) {
		const files = await listDriveFilesByUserIdWithPaginationFromDatabase(deps.db, user.id, {
			limit: 100,
			sinceId: cursor,
		});

		if (files.length === 0) {
			job.updateProgress(100);
			break;
		}

		cursor = files.at(-1)?.id ?? null;

		for (const file of files) {
			await deleteFileSyncForHonoApi(deps, file);
			deletedCount++;
		}

		job.updateProgress(deletedCount / total * 100);
	}
}
