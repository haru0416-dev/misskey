/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { Writable } from 'node:stream';
import { domainToASCII } from 'node:url';
import { format as dateFormat } from 'date-fns';
import _Ajv from 'ajv';
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
import { fetchPollByNoteIdOrFailFromDatabase } from '@/core/PollStore.js';
import { countNotesByUserIdFromDatabase, listNotesByUserIdWithPaginationFromDatabase, listVisibleNotesWithUsersByIdsFromDatabase } from '@/core/NoteStore.js';
import { countClipsByUserIdFromDatabase, listClipsByUserIdFromDatabase } from '@/core/ClipStore.js';
import { listClipNotesByClipIdFromDatabase } from '@/core/ClipNoteStore.js';
import type { DownloadService } from '@/core/DownloadService.js';
import { createTemp } from '@/misc/create-temp.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { shouldHideNoteByTime } from '@/misc/should-hide-note-by-time.js';
import * as Acct from '@/misc/acct.js';
import type { Schema, SchemaType } from '@/misc/json-schema.js';
import type { NoteFavoriteRow } from '@/db/schema/note-favorite.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiBlocking, MiClip, MiFollowing, MiMuting, MiNote, MiUser } from '@/models/_.js';
import type { MiClipNote } from '@/models/ClipNote.js';
import type { MiPoll } from '@/models/Poll.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { Config } from '@/config.js';
import type { DbQueue, RelationshipQueue } from '@/core/QueueModule.js';
import type { DBAntennaImportJobData, DBExportAntennasData, DbExportFollowingData, DbJobDataWithUser, DbUserImportJobData, DbUserImportToDbJobData, RelationshipJobData } from '@/queue/types.js';
import { addDriveFileForHonoApi, type HonoApiDriveFileUploadDependencies } from './hono-api-drive-file-upload.js';
import { packDriveFileManyByIdsForHonoApi } from './hono-api-drive-file.js';
import { isSelfHost } from './hono-api-ap-resolve.js';
import { resolveUserForHonoApi, toPunyForHonoApi, type HonoApiApPersonDependencies } from './hono-api-ap-person.js';
import { refreshUserMutingsCache } from './hono-api-account-mutes.js';
import type { HonoApiInternalEventPublisher } from './hono-api-events.js';
import { createExportCompletedNotification, type HonoApiNotificationDependencies } from './hono-api-notification.js';
import { addUserListMemberForHonoApi, type HonoApiUsersListsDependencies } from './hono-api-users-lists.js';
import { deleteFileSyncForHonoApi, type HonoQueueObjectStorageDependencies } from './hono-queue-object-storage.js';

const Ajv = _Ajv.default;

export type HonoQueueDbDependencies = HonoQueueObjectStorageDependencies & HonoApiDriveFileUploadDependencies & HonoApiNotificationDependencies & HonoApiApPersonDependencies & HonoApiUsersListsDependencies & {
	db: MiDrizzleDatabase;
	downloadService: Pick<DownloadService, 'downloadTextFile'>;
	dbQueue: DbQueue;
	relationshipQueue: RelationshipQueue;
	publishInternalEvent?: HonoApiInternalEventPublisher;
};

const dbQueueJobOptions = {
	removeOnComplete: { age: 3600 * 24 * 7, count: 30 },
	removeOnFail: { age: 3600 * 24 * 7, count: 100 },
};

function toRelationshipJobForHonoApi(name: 'follow' | 'unfollow' | 'block' | 'unblock', data: RelationshipJobData) {
	return {
		name,
		data: {
			from: { id: data.from.id },
			to: { id: data.to.id },
			silent: data.silent,
			requestId: data.requestId,
			withReplies: data.withReplies,
		},
		opts: dbQueueJobOptions,
	};
}

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

export const exportedAntennaSchema = {
	type: 'object',
	properties: {
		name: { type: 'string', minLength: 1, maxLength: 100 },
		src: { type: 'string', enum: ['home', 'all', 'users', 'list', 'users_blacklist'] },
		userListAccts: {
			type: 'array',
			items: {
				type: 'string',
			},
			nullable: true,
		},
		keywords: { type: 'array', items: {
			type: 'array', items: {
				type: 'string',
			},
		} },
		excludeKeywords: { type: 'array', items: {
			type: 'array', items: {
				type: 'string',
			},
		} },
		users: { type: 'array', items: {
			type: 'string',
		} },
		caseSensitive: { type: 'boolean' },
		localOnly: { type: 'boolean' },
		excludeBots: { type: 'boolean' },
		withReplies: { type: 'boolean' },
		withFile: { type: 'boolean' },
		excludeNotesInSensitiveChannel: { type: 'boolean' },
	},
	required: ['name', 'src', 'keywords', 'excludeKeywords', 'users', 'caseSensitive', 'withReplies', 'withFile'],
} as const satisfies Schema;

export type ExportedAntenna = SchemaType<typeof exportedAntennaSchema>;

const validateExportedAntenna = new Ajv().compile<ExportedAntenna>(exportedAntennaSchema);

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

/** ExportAntennasProcessorService.process 相当。 */
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

		const fileName = 'antennas-' + dateFormat(new Date(), 'yyyy-MM-dd-HH-mm-ss') + '.json';
		const driveFile = await addDriveFileForHonoApi(deps, { user, path, name: fileName, force: true, ext: 'json' });

		createExportCompletedNotification(deps, user.id, 'antenna', driveFile.id);
	} finally {
		cleanup();
	}
}

/** ExportFollowingProcessorService.process 相当。 */
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

			for (const following of followings) {
				const u = await fetchUserByIdFromDatabase(deps.db, following.followeeId);
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

		const fileName = 'following-' + dateFormat(new Date(), 'yyyy-MM-dd-HH-mm-ss') + '.csv';
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
				id: genId(deps.config, now.getTime()),
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

/** ImportMutingProcessorService.process 相当。 */
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

			// skip myself
			if (target.id === job.data.user.id) continue;

			await createMutingInDatabase(deps.db, {
				id: genId(deps.config),
				expiresAt: null,
				muterId: user.id,
				muteeId: target.id,
			});
			await refreshUserMutingsCache(deps, user.id);
		} catch {
			// 元実装同様、行単位のエラーはログのみで処理を継続する
		}
	}
}

/** ImportUserListsProcessorService.process 相当。 */
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
					id: genId(deps.config),
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

/** ImportBlockingProcessorService.process 相当。CSVの行ごとにimportBlockingToDbジョブを積む。 */
export async function handleHonoQueueImportBlocking(deps: HonoQueueDbDependencies, job: Bull.Job<DbUserImportJobData>): Promise<void> {
	const user = await fetchUserByIdFromDatabase(deps.db, job.data.user.id);
	if (user == null) return;

	const file = await fetchDriveFileByIdFromDatabase(deps.db, job.data.fileId);
	if (file == null) return;

	const csv = await deps.downloadService.downloadTextFile(file.url);
	const targets = csv.trim().split('\n');

	const jobs = targets.map(target => ({
		name: 'importBlockingToDb',
		data: { user: { id: user.id }, target } satisfies DbUserImportToDbJobData,
		opts: dbQueueJobOptions,
	}));
	await deps.dbQueue.addBulk(jobs);
}

/** ImportBlockingProcessorService.processDb 相当。 */
export async function handleHonoQueueImportBlockingToDb(deps: HonoQueueDbDependencies, job: Bull.Job<DbUserImportToDbJobData>): Promise<void> {
	const line = job.data.target;
	const user = job.data.user;

	try {
		const acct = line.split(',')[0].trim();
		const target = await resolveImportTargetUserForHonoApi(deps, acct);

		if (target == null) {
			throw new Error(`Unable to resolve user: ${acct}`);
		}

		// skip myself
		if (target.id === job.data.user.id) return;

		await deps.relationshipQueue.addBulk([
			toRelationshipJobForHonoApi('block', { from: { id: user.id }, to: { id: target.id }, silent: true }),
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

	const csv = await deps.downloadService.downloadTextFile(file.url);
	const targets = csv.trim().split('\n');

	const jobs = targets.map(target => ({
		name: 'importFollowingToDb',
		data: { user: { id: user.id }, target, withReplies: job.data.withReplies } satisfies DbUserImportToDbJobData,
		opts: dbQueueJobOptions,
	}));
	await deps.dbQueue.addBulk(jobs);
}

/** ImportFollowingProcessorService.processDb 相当。 */
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

		// skip myself
		if (target.id === job.data.user.id) return;

		await deps.relationshipQueue.addBulk([
			toRelationshipJobForHonoApi('follow', {
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
		createdAt: parseId(deps.config, favorite.id).date.toISOString(),
		note: {
			id: favorite.note.id,
			text: favorite.note.text,
			createdAt: parseId(deps.config, favorite.note.id).date.toISOString(),
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

/** ExportFavoritesProcessorService.process 相当。 */
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

			for (const favorite of favorites) {
				const note = noteMap.get(favorite.noteId);
				if (note == null) {
					continue;
				}

				const noteCreatedAt = parseId(deps.config, note.id).date;
				if (shouldHideNoteByTime(note.user.makeNotesHiddenBefore, noteCreatedAt)) {
					continue;
				}

				let poll: MiPoll | undefined;
				if (note.hasPoll) {
					poll = await fetchPollByNoteIdOrFailFromDatabase(deps.db, note.id);
				}
				const content = JSON.stringify(serializeFavoriteForHonoApi(deps, { ...favorite, note }, poll ?? null));
				const isFirst = exportedFavoritesCount === 0;
				await writeToStream(stream, isFirst ? content : ',\n' + content);
				exportedFavoritesCount++;
			}

			job.updateProgress(exportedFavoritesCount / total * 100);
		}

		await writeToStream(stream, ']');
		stream.end();

		const fileName = 'favorites-' + dateFormat(new Date(), 'yyyy-MM-dd-HH-mm-ss') + '.json';
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
		createdAt: parseId(deps.config, note.id).date.toISOString(),
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

			for (const note of notes) {
				const poll = note.hasPoll ? await fetchPollByNoteIdOrFailFromDatabase(deps.db, note.id) : null;
				const files = await packDriveFileManyByIdsForHonoApi(deps, note.fileIds);
				const content = JSON.stringify(serializeNoteForHonoApi(deps, note, poll, files));

				const isFirst = exportedNotesCount === 0;
				await writeToStream(stream, isFirst ? content : ',\n' + content);
				exportedNotesCount++;
			}

			job.updateProgress(exportedNotesCount / total * 100);
		}

		await writeToStream(stream, ']');
		stream.end();

		const fileName = 'notes-' + dateFormat(new Date(), 'yyyy-MM-dd-HH-mm-ss') + '.json';
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
		createdAt: parseId(deps.config, clip.id).date.toISOString(),
		note: {
			id: clip.note.id,
			text: clip.note.text,
			createdAt: parseId(deps.config, clip.note.id).date.toISOString(),
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

		for (const clipNote of clipNotes) {
			const note = noteMap.get(clipNote.noteId);
			if (note == null) continue;

			const noteCreatedAt = parseId(deps.config, note.id).date;
			if (shouldHideNoteByTime(note.user.makeNotesHiddenBefore, noteCreatedAt)) continue;

			let poll: MiPoll | undefined;
			if (note.hasPoll) {
				poll = await fetchPollByNoteIdOrFailFromDatabase(deps.db, note.id);
			}
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

/** ExportClipsProcessorService.process 相当。 */
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

		const fileName = 'clips-' + dateFormat(new Date(), 'yyyy-MM-dd-HH-mm-ss') + '.json';
		const driveFile = await addDriveFileForHonoApi(deps, { user, path, name: fileName, force: true, ext: 'json' });

		createExportCompletedNotification(deps, user.id, 'clip', driveFile.id);
	} finally {
		cleanup();
	}
}
