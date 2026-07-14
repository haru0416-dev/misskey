/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import * as readline from 'node:readline';
import { Writable } from 'node:stream';
import { domainToASCII } from 'node:url';
import { formatDateTimeForFileName } from '@/misc/format-date-time.js';
import { z } from 'zod';
import type * as Bull from 'bullmq';
import { createAntennaInDatabase, listAntennasByUserIdFromDatabase } from '@/core/AntennaStore.js';
import { countDriveFilesByUserIdFromDatabase, listDriveFilesByUserIdWithPaginationFromDatabase } from '@/core/DriveFileStore.js';
import { listFollowingsByFollowerIdFromDatabase } from '@/core/FollowingStore.js';
import { countMutingsByMuterIdFromDatabase, createMutingInDatabase, listMuteeIdsByMuterIdFromDatabase, listPermanentMutingsByMuterIdFromDatabase } from '@/core/MutingStore.js';
import { countBlockingsByBlockerIdFromDatabase, listBlockingsByBlockerIdFromDatabase } from '@/core/BlockingStore.js';
import { createUserListInDatabase, fetchUserListByNameAndUserIdFromDatabase, listUserListsByUserIdFromDatabase } from '@/core/UserListStore.js';
import { listUserListMembershipsByUserListIdFromDatabase, listUserListMembershipUserIdsByUserListIdFromDatabase, userListMembershipExistsInDatabase } from '@/core/UserListMembershipStore.js';
import { fetchUserByIdFromDatabase, fetchUserByUsernameAndHostFromDatabase, listUsersByIdsFromDatabase } from '@/core/UserStore.js';
import { fetchDriveFileByIdFromDatabase } from '@/core/DriveFileStore.js';
import { countNoteFavoritesByUserIdFromDatabase, listNoteFavoritesByUserIdFromDatabase } from '@/core/NoteFavoriteStore.js';
import { listPollsByNoteIdsFromDatabase } from '@/core/PollStore.js';
import { countNotesByUserIdFromDatabase, listNotesByUserIdWithPaginationFromDatabase, listVisibleNotesWithUsersByIdsFromDatabase } from '@/core/NoteStore.js';
import { countClipsByUserIdFromDatabase, listClipsByUserIdFromDatabase } from '@/core/ClipStore.js';
import { listClipNotesByClipIdFromDatabase } from '@/core/ClipNoteStore.js';
import type { DownloadService } from '@/core/DownloadService.js';
import { createTemp } from '@/misc/create-temp.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { shouldHideNoteByTime } from '@/misc/should-hide-note-by-time.js';
import * as Acct from '@/misc/acct.js';
import type { NoteFavoriteRow } from '@/db/schema/note-favorite.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiBlocking, MiClip, MiFollowing, MiMuting, MiNote, MiUser } from '@/models/_.js';
import type { MiClipNote } from '@/models/ClipNote.js';
import type { MiPoll } from '@/models/Poll.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { Config } from '@/config.js';
import { addDbJobs, type DbJobBulkInput, type DbQueue, type RelationshipQueue } from '@/core/queues.js';
import type { DBAntennaImportJobData, DBExportAntennasData, DbExportFollowingData, DbJobDataWithUser, DbUserImportJobData, DbUserImportToDbJobData, RelationshipJobData } from '@/queue/types.js';
import { queueRetentionOptions } from '@/queue/const.js';
import { addDriveFileForHonoApi, type HonoApiDriveFileUploadDependencies } from '../../server/rest/drive-file-upload.js';
import { packDriveFileManyByIdsForHonoApi } from '../../server/rest/drive-file.js';
import { isSelfHost } from '../../server/rest/ap-resolve.js';
import { resolveUserForHonoApi, toPunyForHonoApi, type HonoApiApPersonDependencies } from '../../server/rest/ap-person.js';
import { refreshUserMutingsCache } from '../../server/rest/account-mutes.js';
import type { HonoApiInternalEventPublisher } from '../../server/rest/events.js';
import { createExportCompletedNotification, type HonoApiNotificationDependencies } from '../../server/rest/notification.js';
import { addUserListMemberForHonoApi, type HonoApiUsersListsDependencies } from '../../server/rest/users-lists.js';
import { deleteFileSyncForHonoApi, type HonoQueueObjectStorageDependencies } from './object-storage.js';

export type HonoQueueDbDependencies = HonoQueueObjectStorageDependencies & HonoApiDriveFileUploadDependencies & HonoApiNotificationDependencies & HonoApiApPersonDependencies & HonoApiUsersListsDependencies & {
	db: MiDrizzleDatabase;
	downloadService: Pick<DownloadService, 'downloadTextFile' | 'downloadUrl'>;
	dbQueue: DbQueue;
	relationshipQueue: RelationshipQueue;
	publishInternalEvent?: HonoApiInternalEventPublisher;
};

const importLineJobOptions = {
	removeOnComplete: { age: 3600, count: 100_000 },
	removeOnFail: { age: 3600 * 24 * 7, count: 100 },
};

function toRelationshipJobForHonoApi(config: Pick<Config, 'queues'>, name: 'follow' | 'unfollow' | 'block' | 'unblock', data: RelationshipJobData) {
	return {
		name,
		data: {
			from: { id: data.from.id },
			to: { id: data.to.id },
			silent: data.silent,
			requestId: data.requestId,
			withReplies: data.withReplies,
		},
		opts: queueRetentionOptions(config),
	};
}

function toPuny(host: string): string {
	return domainToASCII(host.toLowerCase());
}

function getFullApAccountForHonoApi(config: Pick<Config, 'runtime'>, username: string, host: string | null): string {
	return host ? `${username}@${toPuny(host)}` : `${username}@${toPuny(config.runtime.host)}`;
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

function writeToStream(stream: fs.WriteStream, content: string): Promise<void> {
	return new Promise<void>((res, rej) => {
		stream.write(content, err => {
			if (err) {
				rej(err);
			} else {
				res();
			}
		});
	});
}

export const exportedAntennaZodSchema = z.object({
	name: z.string().min(1).max(100),
	src: z.enum(['home', 'all', 'users', 'list', 'users_blacklist']),
	userListAccts: z.array(z.string()).nullable().optional(),
	keywords: z.array(z.array(z.string())),
	excludeKeywords: z.array(z.array(z.string())),
	users: z.array(z.string()),
	caseSensitive: z.boolean(),
	localOnly: z.boolean().optional(),
	excludeBots: z.boolean().optional(),
	withReplies: z.boolean(),
	withFile: z.boolean(),
	excludeNotesInSensitiveChannel: z.boolean().optional(),
});

export type ExportedAntenna = z.infer<typeof exportedAntennaZodSchema>;

function validateExportedAntenna(data: unknown): data is ExportedAntenna {
	return exportedAntennaZodSchema.safeParse(data).success;
}

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
			const users = await listUsersByIdsFromDatabase(deps.db, mutes.map(mute => mute.muteeId), { includeSuspended: true });
			const userMap = new Map(users.map(user => [user.id, user]));

			for (const mute of mutes) {
				const u = userMap.get(mute.muteeId);
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

		const fileName = 'mute-' + formatDateTimeForFileName(new Date()) + '.csv';
		const driveFile = await addDriveFileForHonoApi(deps, { user, path, name: fileName, force: true, ext: 'csv' });

		createExportCompletedNotification(deps, user.id, 'muting', driveFile.id);
	} finally {
		cleanup();
	}
}

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
			const users = await listUsersByIdsFromDatabase(deps.db, blockings.map(blocking => blocking.blockeeId), { includeSuspended: true });
			const userMap = new Map(users.map(user => [user.id, user]));

			for (const block of blockings) {
				const u = userMap.get(block.blockeeId);
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

		const fileName = 'blocking-' + formatDateTimeForFileName(new Date()) + '.csv';
		const driveFile = await addDriveFileForHonoApi(deps, { user, path, name: fileName, force: true, ext: 'csv' });

		createExportCompletedNotification(deps, user.id, 'blocking', driveFile.id);
	} finally {
		cleanup();
	}
}

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

		const fileName = 'user-lists-' + formatDateTimeForFileName(new Date()) + '.csv';
		const driveFile = await addDriveFileForHonoApi(deps, { user, path, name: fileName, force: true, ext: 'csv' });

		createExportCompletedNotification(deps, user.id, 'userList', driveFile.id);
	} finally {
		cleanup();
	}
}

export async function handleHonoQueueExportAntennas(deps: HonoQueueDbDependencies, job: Bull.Job<DBExportAntennasData>): Promise<void> {
	const user = await fetchUserByIdFromDatabase(deps.db, job.data.user.id);
	if (user == null) return;

	const [path, cleanup] = await createTemp();

	try {
		const stream = fs.createWriteStream(path, { flags: 'a' });

		const antennas = await listAntennasByUserIdFromDatabase(deps.db, job.data.user.id);
		await writeToStream(stream, '[');
		for (const [index, antenna] of antennas.entries()) {
			let users: Awaited<ReturnType<typeof listUsersByIdsFromDatabase>> | undefined;
			if (antenna.userListId !== null) {
				const memberIds = await listUserListMembershipUserIdsByUserListIdFromDatabase(deps.db, antenna.userListId);
				users = await listUsersByIdsFromDatabase(deps.db, memberIds, { includeSuspended: true });
			}
			await writeToStream(stream, JSON.stringify({
				name: antenna.name,
				src: antenna.src,
				keywords: antenna.keywords,
				excludeKeywords: antenna.excludeKeywords,
				users: antenna.users,
				userListAccts: users !== undefined ? users.map(u => getFullApAccountForHonoApi(deps.config, u.username, u.host)) : null,
				caseSensitive: antenna.caseSensitive,
				localOnly: antenna.localOnly,
				excludeBots: antenna.excludeBots,
				withReplies: antenna.withReplies,
				withFile: antenna.withFile,
				excludeNotesInSensitiveChannel: antenna.excludeNotesInSensitiveChannel,
			} satisfies Required<ExportedAntenna>));
			if (antennas.length - 1 !== index) {
				await writeToStream(stream, ', ');
			}
		}
		await writeToStream(stream, ']');
		stream.end();

		const fileName = 'antennas-' + formatDateTimeForFileName(new Date()) + '.json';
		const driveFile = await addDriveFileForHonoApi(deps, { user, path, name: fileName, force: true, ext: 'json' });

		createExportCompletedNotification(deps, user.id, 'antenna', driveFile.id);
	} finally {
		cleanup();
	}
}

export async function handleHonoQueueExportFollowing(deps: HonoQueueDbDependencies, job: Bull.Job<DbExportFollowingData>): Promise<void> {
	const user = await fetchUserByIdFromDatabase(deps.db, job.data.user.id);
	if (user == null) return;

	const [path, cleanup] = await createTemp();

	try {
		const stream = fs.createWriteStream(path, { flags: 'a' });

		let cursor: MiFollowing['id'] | null = null;

		const mutingUserIds = job.data.excludeMuting ? await listMuteeIdsByMuterIdFromDatabase(deps.db, user.id) : [];

		for (;;) {
			const followings = await listFollowingsByFollowerIdFromDatabase(deps.db, user.id, {
				limit: 100,
				sinceId: cursor,
				excludeFolloweeIds: mutingUserIds,
			});

			if (followings.length === 0) {
				break;
			}

			cursor = followings.at(-1)?.id ?? null;
			const users = await listUsersByIdsFromDatabase(deps.db, followings.map(following => following.followeeId), { includeSuspended: true });
			const userMap = new Map(users.map(user => [user.id, user]));

			for (const following of followings) {
				const u = userMap.get(following.followeeId);
				if (u == null) {
					continue;
				}

				if (job.data.excludeInactive && u.updatedAt && (Date.now() - u.updatedAt.getTime() > (1000 * 60 * 60 * 24 * 90))) {
					continue;
				}

				const userAcct = getFullApAccountForHonoApi(deps.config, u.username, u.host);
				await writeLineToStream(stream, `${userAcct},withReplies=${following.withReplies}`);
			}
		}

		stream.end();

		const fileName = 'following-' + formatDateTimeForFileName(new Date()) + '.csv';
		const driveFile = await addDriveFileForHonoApi(deps, { user, path, name: fileName, force: true, ext: 'csv' });

		createExportCompletedNotification(deps, user.id, 'following', driveFile.id);
	} finally {
		cleanup();
	}
}

/**
 * ImportAntennasProcessorService.process 相当。元実装同様、ループ全体をtry/catchし
 * エラーはログのみで再送しない (1件の失敗で残りのアンテナ作成が中断されうる挙動も含めて再現)。
 */
export async function handleHonoQueueImportAntennas(deps: HonoQueueDbDependencies, job: Bull.Job<DBAntennaImportJobData>): Promise<void> {
	const now = new Date();
	try {
		for (const antenna of job.data.antenna) {
			if (antenna.keywords.length === 0 || antenna.keywords[0].every(x => x === '')) continue;
			if (!validateExportedAntenna(antenna)) continue;

			const result = await createAntennaInDatabase(deps.db, {
				id: genId(now.getTime()),
				lastUsedAt: now,
				userId: job.data.user.id,
				name: antenna.name,
				src: antenna.src === 'list' && antenna.userListAccts ? 'users' : antenna.src,
				userListId: null,
				keywords: antenna.keywords,
				excludeKeywords: antenna.excludeKeywords,
				users: (antenna.src === 'list' && antenna.userListAccts !== null ? antenna.userListAccts : antenna.users).filter(Boolean),
				caseSensitive: antenna.caseSensitive,
				localOnly: antenna.localOnly,
				excludeBots: antenna.excludeBots,
				withReplies: antenna.withReplies,
				withFile: antenna.withFile,
				excludeNotesInSensitiveChannel: antenna.excludeNotesInSensitiveChannel,
			});

			deps.publishInternalEvent?.('antennaCreated', result);
		}
	} catch {
		// 元実装同様、ここでのエラーは再送しない
	}
}

/**
 * ImportMuting/ImportBlocking/ImportFollowingProcessorService 共通の
 * 「CSV1行(acct)からミュート/ブロック/フォロー対象ユーザーを解決する」ロジック相当。
 * ローカルユーザーの解決に失敗した場合はnullを返す (呼び出し元でスキップする)。
 */
async function resolveImportTargetUserForHonoApi(
	deps: HonoQueueDbDependencies,
	acct: string,
): Promise<import('@/models/User.js').MiUser | null> {
	const { username, host } = Acct.parse(acct);
	if (!host) return null;

	let target = await fetchUserByUsernameAndHostFromDatabase(
		deps.db,
		username,
		isSelfHost(deps.config, host) ? null : toPunyForHonoApi(host),
	);

	if (target == null) {
		target = await resolveUserForHonoApi(deps, username, host);
	}

	return target;
}

export async function handleHonoQueueImportMuting(deps: HonoQueueDbDependencies, job: Bull.Job<DbUserImportJobData>): Promise<void> {
	const user = await fetchUserByIdFromDatabase(deps.db, job.data.user.id);
	if (user == null) return;

	const file = await fetchDriveFileByIdFromDatabase(deps.db, job.data.fileId);
	if (file == null) return;

	const csv = await deps.downloadService.downloadTextFile(file.url);

	for (const line of csv.trim().split('\n')) {
		try {
			const acct = line.split(',')[0].trim();
			const target = await resolveImportTargetUserForHonoApi(deps, acct);

			if (target == null) {
				throw new Error(`cannot resolve user: ${acct}`);
			}

			if (target.id === job.data.user.id) continue;

			await createMutingInDatabase(deps.db, {
				id: genId(),
				expiresAt: null,
				muterId: user.id,
				muteeId: target.id,
			});
			await refreshUserMutingsCache(deps, user.id);
			deps.publishInternalEvent?.('mute', { muterId: user.id, muteeId: target.id });
		} catch {
			// 元実装同様、行単位のエラーはログのみで処理を継続する
		}
	}
}

export async function handleHonoQueueImportUserLists(deps: HonoQueueDbDependencies, job: Bull.Job<DbUserImportJobData>): Promise<void> {
	const user = await fetchUserByIdFromDatabase(deps.db, job.data.user.id);
	if (user == null) return;

	const file = await fetchDriveFileByIdFromDatabase(deps.db, job.data.fileId);
	if (file == null) return;

	const csv = await deps.downloadService.downloadTextFile(file.url);

	for (const line of csv.trim().split('\n')) {
		try {
			const parts = line.split(',');
			const listName = parts[0].trim();
			const { username, host } = Acct.parse(parts[1].trim());
			let withReplies = false;

			for (const keyValue of parts.slice(2)) {
				const [key, value] = keyValue.split('=');
				switch (key) {
					case 'withReplies':
						withReplies = value === 'true';
						break;
				}
			}

			let list = await fetchUserListByNameAndUserIdFromDatabase(deps.db, listName, user.id);

			if (list == null) {
				list = await createUserListInDatabase(deps.db, {
					id: genId(),
					userId: user.id,
					name: listName,
				});
			}

			let target = await fetchUserByUsernameAndHostFromDatabase(
				deps.db,
				username,
				isSelfHost(deps.config, host) ? null : toPunyForHonoApi(host!),
			);

			if (target == null) {
				target = await resolveUserForHonoApi(deps, username, host);
			}

			if (await userListMembershipExistsInDatabase(deps.db, target.id, list.id)) continue;

			await addUserListMemberForHonoApi(deps, target, list, user, { withReplies });
		} catch {
			// 元実装同様、行単位のエラーはログのみで処理を継続する
		}
	}
}

async function enqueueImportLines<K extends 'importBlockingToDb' | 'importFollowingToDb'>(
	deps: HonoQueueDbDependencies,
	url: string,
	createJob: (line: string, index: number) => DbJobBulkInput<K>,
): Promise<void> {
	const [path, cleanup] = await createTemp();
	try {
		await deps.downloadService.downloadUrl(url, path);
		const lines = readline.createInterface({ input: fs.createReadStream(path), crlfDelay: Infinity });
		let jobs: DbJobBulkInput<K>[] = [];
		let lineIndex = 0;
		for await (const line of lines) {
			if (line.trim() === '') continue;
			jobs.push(createJob(line, lineIndex++));
			if (jobs.length >= 500) {
				await addDbJobs(deps.dbQueue, jobs);
				jobs = [];
			}
		}
		if (jobs.length > 0) await addDbJobs(deps.dbQueue, jobs);
	} finally {
		cleanup();
	}
}

/** ImportBlockingProcessorService.process 相当。CSVの行ごとにimportBlockingToDbジョブを積む。 */
export async function handleHonoQueueImportBlocking(deps: HonoQueueDbDependencies, job: Bull.Job<DbUserImportJobData>): Promise<void> {
	const user = await fetchUserByIdFromDatabase(deps.db, job.data.user.id);
	if (user == null) return;

	const file = await fetchDriveFileByIdFromDatabase(deps.db, job.data.fileId);
	if (file == null) return;

	await enqueueImportLines(deps, file.url, (target, index) => ({
		name: 'importBlockingToDb',
		data: { user: { id: user.id }, target } satisfies DbUserImportToDbJobData,
		opts: { ...importLineJobOptions, jobId: `import-blocking-${job.id}-${index}` },
	}));
}

export async function handleHonoQueueImportBlockingToDb(deps: HonoQueueDbDependencies, job: Bull.Job<DbUserImportToDbJobData>): Promise<void> {
	const line = job.data.target;
	const user = job.data.user;

	try {
		const acct = line.split(',')[0].trim();
		const target = await resolveImportTargetUserForHonoApi(deps, acct);

		if (target == null) {
			throw new Error(`Unable to resolve user: ${acct}`);
		}

		if (target.id === job.data.user.id) return;

		await deps.relationshipQueue.addBulk([
			toRelationshipJobForHonoApi(deps.config, 'block', { from: { id: user.id }, to: { id: target.id }, silent: true }),
		]);
	} catch {
		// 元実装同様、行単位のエラーはログのみで処理を継続する
	}
}

/** ImportFollowingProcessorService.process 相当。CSVの行ごとにimportFollowingToDbジョブを積む。 */
export async function handleHonoQueueImportFollowing(deps: HonoQueueDbDependencies, job: Bull.Job<DbUserImportJobData>): Promise<void> {
	const user = await fetchUserByIdFromDatabase(deps.db, job.data.user.id);
	if (user == null) return;

	const file = await fetchDriveFileByIdFromDatabase(deps.db, job.data.fileId);
	if (file == null) return;

	await enqueueImportLines(deps, file.url, (target, index) => ({
		name: 'importFollowingToDb',
		data: { user: { id: user.id }, target, withReplies: job.data.withReplies } satisfies DbUserImportToDbJobData,
		opts: { ...importLineJobOptions, jobId: `import-following-${job.id}-${index}` },
	}));
}

export async function handleHonoQueueImportFollowingToDb(deps: HonoQueueDbDependencies, job: Bull.Job<DbUserImportToDbJobData>): Promise<void> {
	const line = job.data.target;
	const user = job.data.user;

	try {
		const parts = line.split(',');
		const acct = parts[0].trim();
		let withReplies: boolean | null = null;

		for (const keyValue of parts.slice(2)) {
			const [key, value] = keyValue.split('=');
			switch (key) {
				case 'withReplies':
					withReplies = value === 'true';
					break;
			}
		}

		const target = await resolveImportTargetUserForHonoApi(deps, acct);

		if (target == null) {
			throw new Error(`Unable to resolve user: ${acct}`);
		}

		if (target.id === job.data.user.id) return;

		await deps.relationshipQueue.addBulk([
			toRelationshipJobForHonoApi(deps.config, 'follow', {
				from: user,
				to: { id: target.id },
				silent: true,
				withReplies: withReplies ?? job.data.withReplies,
			}),
		]);
	} catch {
		// 元実装同様、行単位のエラーはログのみで処理を継続する
	}
}

function serializeFavoriteForHonoApi(
	deps: Pick<HonoQueueDbDependencies, 'config'>,
	favorite: NoteFavoriteRow & { note: MiNote & { user: MiUser } },
	poll: MiPoll | null = null,
): Record<string, unknown> {
	return {
		id: favorite.id,
		createdAt: parseId(favorite.id).date.toISOString(),
		note: {
			id: favorite.note.id,
			text: favorite.note.text,
			createdAt: parseId(favorite.note.id).date.toISOString(),
			fileIds: favorite.note.fileIds,
			replyId: favorite.note.replyId,
			renoteId: favorite.note.renoteId,
			poll,
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

export async function handleHonoQueueExportFavorites(deps: HonoQueueDbDependencies, job: Bull.Job<DbJobDataWithUser>): Promise<void> {
	const user = await fetchUserByIdFromDatabase(deps.db, job.data.user.id);
	if (user == null) return;

	const [path, cleanup] = await createTemp();

	try {
		const stream = fs.createWriteStream(path, { flags: 'a' });

		await writeToStream(stream, '[');

		let exportedFavoritesCount = 0;
		let cursor: NoteFavoriteRow['id'] | null = null;

		const total = await countNoteFavoritesByUserIdFromDatabase(deps.db, user.id);

		for (;;) {
			const favorites = await listNoteFavoritesByUserIdFromDatabase(deps.db, user.id, {
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
			const notes = await listVisibleNotesWithUsersByIdsFromDatabase(deps.db, noteIds, { id: user.id });
			const noteMap = new Map(notes.map(note => [note.id, note]));
			const polls = await listPollsByNoteIdsFromDatabase(deps.db, notes.filter(note => note.hasPoll).map(note => note.id));
			const pollMap = new Map(polls.map(poll => [poll.noteId, poll]));

			for (const favorite of favorites) {
				const note = noteMap.get(favorite.noteId);
				if (note == null) {
					continue;
				}

				const noteCreatedAt = parseId(note.id).date;
				if (shouldHideNoteByTime(note.user.makeNotesHiddenBefore, noteCreatedAt)) {
					continue;
				}

				const poll = pollMap.get(note.id);
				const content = JSON.stringify(serializeFavoriteForHonoApi(deps, { ...favorite, note }, poll ?? null));
				const isFirst = exportedFavoritesCount === 0;
				await writeToStream(stream, isFirst ? content : ',\n' + content);
				exportedFavoritesCount++;
			}

			job.updateProgress(exportedFavoritesCount / total * 100);
		}

		await writeToStream(stream, ']');
		stream.end();

		const fileName = 'favorites-' + formatDateTimeForFileName(new Date()) + '.json';
		const driveFile = await addDriveFileForHonoApi(deps, { user, path, name: fileName, force: true, ext: 'json' });

		createExportCompletedNotification(deps, user.id, 'favorite', driveFile.id);
	} finally {
		cleanup();
	}
}

function serializeNoteForHonoApi(
	deps: Pick<HonoQueueDbDependencies, 'config'>,
	note: MiNote,
	poll: MiPoll | null,
	files: Awaited<ReturnType<typeof packDriveFileManyByIdsForHonoApi>>,
): Record<string, unknown> {
	return {
		id: note.id,
		text: note.text,
		createdAt: parseId(note.id).date.toISOString(),
		fileIds: note.fileIds,
		files,
		replyId: note.replyId,
		renoteId: note.renoteId,
		poll,
		cw: note.cw,
		visibility: note.visibility,
		visibleUserIds: note.visibleUserIds,
		localOnly: note.localOnly,
		reactionAcceptance: note.reactionAcceptance,
	};
}

/**
 * ExportNotesProcessorService.process 相当。
 * 元実装はWeb Streams API (NoteStream/JsonArrayStream/FileWriterStream) でメモリを
 * 抑えているが、他のexport系ポートと同じ「fs.createWriteStreamへの逐次write」方式でも
 * 同じくノート単位でストリーム書き込みされるため、メモリ特性を維持したまま簡潔に移植した。
 */
export async function handleHonoQueueExportNotes(deps: HonoQueueDbDependencies, job: Bull.Job<DbJobDataWithUser>): Promise<void> {
	const user = await fetchUserByIdFromDatabase(deps.db, job.data.user.id);
	if (user == null) return;

	const [path, cleanup] = await createTemp();

	try {
		const stream = fs.createWriteStream(path, { flags: 'a' });

		await writeToStream(stream, '[');

		let exportedNotesCount = 0;
		let cursor: MiNote['id'] | null = null;

		const total = await countNotesByUserIdFromDatabase(deps.db, user.id);

		for (;;) {
			const notes = await listNotesByUserIdWithPaginationFromDatabase(deps.db, user.id, {
				limit: 100,
				sinceId: cursor,
			});

			if (notes.length === 0) {
				job.updateProgress(100);
				break;
			}

			cursor = notes.at(-1)?.id ?? null;
			const polls = await listPollsByNoteIdsFromDatabase(deps.db, notes.filter(note => note.hasPoll).map(note => note.id));
			const pollMap = new Map(polls.map(poll => [poll.noteId, poll]));
			const fileIds = [...new Set(notes.flatMap(note => note.fileIds))];
			const packedFiles = await packDriveFileManyByIdsForHonoApi(deps, fileIds);
			const packedFileMap = new Map(packedFiles.map(file => [file.id, file]));

			for (const note of notes) {
				const poll = pollMap.get(note.id) ?? null;
				const files = note.fileIds.map(fileId => packedFileMap.get(fileId)).filter((file): file is NonNullable<typeof file> => file != null);
				const content = JSON.stringify(serializeNoteForHonoApi(deps, note, poll, files));

				const isFirst = exportedNotesCount === 0;
				await writeToStream(stream, isFirst ? content : ',\n' + content);
				exportedNotesCount++;
			}

			job.updateProgress(exportedNotesCount / total * 100);
		}

		await writeToStream(stream, ']');
		stream.end();

		const fileName = 'notes-' + formatDateTimeForFileName(new Date()) + '.json';
		const driveFile = await addDriveFileForHonoApi(deps, { user, path, name: fileName, force: true, ext: 'json' });

		createExportCompletedNotification(deps, user.id, 'note', driveFile.id);
	} finally {
		cleanup();
	}
}

function serializeClipForHonoApi(clip: MiClip): Record<string, unknown> {
	return {
		id: clip.id,
		name: clip.name,
		description: clip.description,
		lastClippedAt: clip.lastClippedAt?.toISOString(),
		clipNotes: [],
	};
}

function serializeClipNoteForHonoApi(
	deps: Pick<HonoQueueDbDependencies, 'config'>,
	clip: MiClipNote & { note: MiNote & { user: MiUser } },
	poll: MiPoll | undefined,
): Record<string, unknown> {
	return {
		id: clip.id,
		createdAt: parseId(clip.id).date.toISOString(),
		note: {
			id: clip.note.id,
			text: clip.note.text,
			createdAt: parseId(clip.note.id).date.toISOString(),
			fileIds: clip.note.fileIds,
			replyId: clip.note.replyId,
			renoteId: clip.note.renoteId,
			poll,
			cw: clip.note.cw,
			visibility: clip.note.visibility,
			visibleUserIds: clip.note.visibleUserIds,
			localOnly: clip.note.localOnly,
			reactionAcceptance: clip.note.reactionAcceptance,
			uri: clip.note.uri,
			url: clip.note.url,
			user: {
				id: clip.note.user.id,
				name: clip.note.user.name,
				username: clip.note.user.username,
				host: clip.note.user.host,
				uri: clip.note.user.uri,
			},
		},
	};
}

async function processClipNotesForHonoApi(
	deps: HonoQueueDbDependencies,
	writer: WritableStreamDefaultWriter,
	clipId: MiClip['id'],
	userId: MiUser['id'],
): Promise<void> {
	let exportedClipNotesCount = 0;
	let cursor: MiClipNote['id'] | null = null;

	for (;;) {
		const clipNotes = await listClipNotesByClipIdFromDatabase(deps.db, clipId, {
			afterId: cursor,
			limit: 100,
		});

		if (clipNotes.length === 0) break;

		cursor = clipNotes.at(-1)?.id ?? null;
		const noteIds = clipNotes.map(clipNote => clipNote.noteId);
		const notes = await listVisibleNotesWithUsersByIdsFromDatabase(deps.db, noteIds, { id: userId });
		const noteMap = new Map(notes.map(note => [note.id, note]));
		const polls = await listPollsByNoteIdsFromDatabase(deps.db, notes.filter(note => note.hasPoll).map(note => note.id));
		const pollMap = new Map(polls.map(poll => [poll.noteId, poll]));

		for (const clipNote of clipNotes) {
			const note = noteMap.get(clipNote.noteId);
			if (note == null) continue;

			const noteCreatedAt = parseId(note.id).date;
			if (shouldHideNoteByTime(note.user.makeNotesHiddenBefore, noteCreatedAt)) continue;

			const poll = pollMap.get(note.id);
			const content = JSON.stringify(serializeClipNoteForHonoApi(deps, { ...clipNote, note }, poll));
			const isFirst = exportedClipNotesCount === 0;
			await writer.write(isFirst ? content : ',\n' + content);

			exportedClipNotesCount++;
		}
	}
}

async function processClipsForHonoApi(
	deps: HonoQueueDbDependencies,
	writer: WritableStreamDefaultWriter,
	user: MiUser,
	job: Bull.Job<DbJobDataWithUser>,
): Promise<void> {
	let exportedClipsCount = 0;
	let cursor: MiClip['id'] | null = null;

	const total = await countClipsByUserIdFromDatabase(deps.db, user.id);

	for (;;) {
		const clips = await listClipsByUserIdFromDatabase(deps.db, user.id, {
			afterId: cursor,
			limit: 100,
		});

		if (clips.length === 0) {
			job.updateProgress(100);
			break;
		}

		cursor = clips.at(-1)?.id ?? null;

		for (const clip of clips) {
			// Stringify but remove the last `]}`
			const content = JSON.stringify(serializeClipForHonoApi(clip)).slice(0, -2);
			const isFirst = exportedClipsCount === 0;
			await writer.write(isFirst ? content : ',\n' + content);

			await processClipNotesForHonoApi(deps, writer, clip.id, user.id);

			await writer.write(']}');
			exportedClipsCount++;
		}

		job.updateProgress(exportedClipsCount / total * 100);
	}
}

export async function handleHonoQueueExportClips(deps: HonoQueueDbDependencies, job: Bull.Job<DbJobDataWithUser>): Promise<void> {
	const user = await fetchUserByIdFromDatabase(deps.db, job.data.user.id);
	if (user == null) return;

	const [path, cleanup] = await createTemp();

	try {
		const webStream = Writable.toWeb(fs.createWriteStream(path, { flags: 'a' }));
		const writer = webStream.getWriter();
		writer.closed.catch(() => {});

		await writer.write('[');

		await processClipsForHonoApi(deps, writer, user, job);

		await writer.write(']');
		await writer.close();

		const fileName = 'clips-' + formatDateTimeForFileName(new Date()) + '.json';
		const driveFile = await addDriveFileForHonoApi(deps, { user, path, name: fileName, force: true, ext: 'json' });

		createExportCompletedNotification(deps, user.id, 'clip', driveFile.id);
	} finally {
		cleanup();
	}
}
