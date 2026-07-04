/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { domainToASCII } from 'node:url';
import { format as dateFormat } from 'date-fns';
import type * as Bull from 'bullmq';
import { countDriveFilesByUserIdFromDatabase, listDriveFilesByUserIdWithPaginationFromDatabase } from '@/core/DriveFileStore.js';
import { countMutingsByMuterIdFromDatabase, listPermanentMutingsByMuterIdFromDatabase } from '@/core/MutingStore.js';
import { countBlockingsByBlockerIdFromDatabase, listBlockingsByBlockerIdFromDatabase } from '@/core/BlockingStore.js';
import { listUserListsByUserIdFromDatabase } from '@/core/UserListStore.js';
import { listUserListMembershipsByUserListIdFromDatabase } from '@/core/UserListMembershipStore.js';
import { fetchUserByIdFromDatabase, listUsersByIdsFromDatabase } from '@/core/UserStore.js';
import { createTemp } from '@/misc/create-temp.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiBlocking, MiMuting } from '@/models/_.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { Config } from '@/config.js';
import type { DbJobDataWithUser } from '@/queue/types.js';
import { addDriveFileForHonoApi, type HonoApiDriveFileUploadDependencies } from './hono-api-drive-file-upload.js';
import { createExportCompletedNotification, type HonoApiNotificationDependencies } from './hono-api-notification.js';
import { deleteFileSyncForHonoApi, type HonoQueueObjectStorageDependencies } from './hono-queue-object-storage.js';

export type HonoQueueDbDependencies = HonoQueueObjectStorageDependencies & HonoApiDriveFileUploadDependencies & HonoApiNotificationDependencies & {
	db: MiDrizzleDatabase;
};

function toPuny(host: string): string {
	return domainToASCII(host.toLowerCase());
}

function getFullApAccountForHonoApi(config: Pick<Config, 'host'>, username: string, host: string | null): string {
	return host ? `${username}@${toPuny(host)}` : `${username}@${toPuny(config.host)}`;
}

function writeLineToStream(stream: fs.WriteStream, content: string): Promise<void> {
	return new Promise<void>((res, rej) => {
		stream.write(content + '\n', err => {
			if (err) {
				rej(err);
			} else {
				res();
			}
		});
	});
}

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

/** ExportMutingProcessorService.process 相当。 */
export async function handleHonoQueueExportMuting(deps: HonoQueueDbDependencies, job: Bull.Job<DbJobDataWithUser>): Promise<void> {
	const user = await fetchUserByIdFromDatabase(deps.db, job.data.user.id);
	if (user == null) return;

	const [path, cleanup] = await createTemp();

	try {
		const stream = fs.createWriteStream(path, { flags: 'a' });

		let exportedCount = 0;
		let cursor: MiMuting['id'] | null = null;

		const total = await countMutingsByMuterIdFromDatabase(deps.db, user.id);

		for (;;) {
			const mutes = await listPermanentMutingsByMuterIdFromDatabase(deps.db, user.id, {
				limit: 100,
				sinceId: cursor,
			});

			if (mutes.length === 0) {
				job.updateProgress(100);
				break;
			}

			cursor = mutes.at(-1)?.id ?? null;

			for (const mute of mutes) {
				const u = await fetchUserByIdFromDatabase(deps.db, mute.muteeId);
				if (u == null) {
					exportedCount++;
					continue;
				}

				await writeLineToStream(stream, getFullApAccountForHonoApi(deps.config, u.username, u.host));
				exportedCount++;
			}

			job.updateProgress(exportedCount / total * 100);
		}

		stream.end();

		const fileName = 'mute-' + dateFormat(new Date(), 'yyyy-MM-dd-HH-mm-ss') + '.csv';
		const driveFile = await addDriveFileForHonoApi(deps, { user, path, name: fileName, force: true, ext: 'csv' });

		createExportCompletedNotification(deps, user.id, 'muting', driveFile.id);
	} finally {
		cleanup();
	}
}

/** ExportBlockingProcessorService.process 相当。 */
export async function handleHonoQueueExportBlocking(deps: HonoQueueDbDependencies, job: Bull.Job<DbJobDataWithUser>): Promise<void> {
	const user = await fetchUserByIdFromDatabase(deps.db, job.data.user.id);
	if (user == null) return;

	const [path, cleanup] = await createTemp();

	try {
		const stream = fs.createWriteStream(path, { flags: 'a' });

		let exportedCount = 0;
		let cursor: MiBlocking['id'] | null = null;

		const total = await countBlockingsByBlockerIdFromDatabase(deps.db, user.id);

		for (;;) {
			const blockings = await listBlockingsByBlockerIdFromDatabase(deps.db, user.id, {
				limit: 100,
				sinceId: cursor,
			});

			if (blockings.length === 0) {
				job.updateProgress(100);
				break;
			}

			cursor = blockings.at(-1)?.id ?? null;

			for (const block of blockings) {
				const u = await fetchUserByIdFromDatabase(deps.db, block.blockeeId);
				if (u == null) {
					exportedCount++;
					continue;
				}

				await writeLineToStream(stream, getFullApAccountForHonoApi(deps.config, u.username, u.host));
				exportedCount++;
			}

			job.updateProgress(exportedCount / total * 100);
		}

		stream.end();

		const fileName = 'blocking-' + dateFormat(new Date(), 'yyyy-MM-dd-HH-mm-ss') + '.csv';
		const driveFile = await addDriveFileForHonoApi(deps, { user, path, name: fileName, force: true, ext: 'csv' });

		createExportCompletedNotification(deps, user.id, 'blocking', driveFile.id);
	} finally {
		cleanup();
	}
}

/** ExportUserListsProcessorService.process 相当。 */
export async function handleHonoQueueExportUserLists(deps: HonoQueueDbDependencies, job: Bull.Job<DbJobDataWithUser>): Promise<void> {
	const user = await fetchUserByIdFromDatabase(deps.db, job.data.user.id);
	if (user == null) return;

	const lists = await listUserListsByUserIdFromDatabase(deps.db, user.id);

	const [path, cleanup] = await createTemp();

	try {
		const stream = fs.createWriteStream(path, { flags: 'a' });

		for (const list of lists) {
			const memberships = await listUserListMembershipsByUserListIdFromDatabase(deps.db, list.id);
			const users = await listUsersByIdsFromDatabase(deps.db, memberships.map(m => m.userId), { includeSuspended: true });
			const usersWithReplies = new Set(memberships.filter(m => m.withReplies).map(m => m.userId));

			for (const u of users) {
				const acct = getFullApAccountForHonoApi(deps.config, u.username, u.host);
				// 3rd column and later will be key=value pairs
				await writeLineToStream(stream, `${list.name},${acct},withReplies=${usersWithReplies.has(u.id)}`);
			}
		}

		stream.end();

		const fileName = 'user-lists-' + dateFormat(new Date(), 'yyyy-MM-dd-HH-mm-ss') + '.csv';
		const driveFile = await addDriveFileForHonoApi(deps, { user, path, name: fileName, force: true, ext: 'csv' });

		createExportCompletedNotification(deps, user.id, 'userList', driveFile.id);
	} finally {
		cleanup();
	}
}
