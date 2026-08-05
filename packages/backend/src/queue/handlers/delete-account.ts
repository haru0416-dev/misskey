/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Meilisearch } from 'meilisearch';
import * as Bull from 'bullmq';
import type { EmailService } from '@/core/EmailService.js';
import { listPagesByUserIdWithPaginationFromDatabase } from '@/core/PageStore.js';
import { listDriveFilesByUserIdWithPaginationFromDatabase } from '@/core/DriveFileStore.js';
import { deleteNotesByIdsFromDatabase, listNotesByUserIdWithPaginationFromDatabase } from '@/core/NoteStore.js';
import { deleteUserByIdFromDatabase, fetchUserByIdFromDatabase } from '@/core/UserStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/UserProfileStore.js';
import type { Config } from '@/config.js';
import type { DbQueue, DeliverQueue } from '@/core/queues.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiMeta, MiUser } from '@/models/_.js';
import type { MiNote } from '@/models/Note.js';
import type { DbUserDeleteJobData } from '@/queue/types.js';
import { deletePageForHonoApi, type HonoApiPageDependencies } from '../../server/rest/pages.js';
import { deleteFileSyncForHonoApi, type HonoQueueObjectStorageDependencies } from './object-storage.js';

export type HonoQueueDeleteAccountDependencies = HonoQueueObjectStorageDependencies & HonoApiPageDependencies & {
	db: MiDrizzleDatabase;
	config: Config;
	meta: Pick<MiMeta, 'rootUserId'>;
	dbQueue: DbQueue;
	deliverQueue: DeliverQueue;
	meilisearch: Meilisearch | null;
	emailService: Pick<EmailService, 'sendEmail'>;
	publishInternalEvent?: <K extends 'userChangeDeletedState'>(type: K, value: { id: MiUser['id']; isDeleted: true }) => void;
};

async function unindexNoteForHonoApi(deps: HonoQueueDeleteAccountDependencies, note: Pick<MiNote, 'id' | 'visibility'>): Promise<void> {
	if (!deps.meilisearch) return;
	if (!['home', 'public'].includes(note.visibility)) return;

	const index = deps.meilisearch.index(`${deps.config.search.meilisearch!.index}---notes`);
	await index.deleteDocument(note.id);
}

export async function handleHonoQueueDeleteAccount(deps: HonoQueueDeleteAccountDependencies, job: Bull.Job<DbUserDeleteJobData>): Promise<string | void> {
	const user = await fetchUserByIdFromDatabase(deps.db, job.data.user.id);
	if (user == null) return;
	if (user.host == null && !job.data.soft && job.data.accountDeleteCoordinatorId == null) {
		throw new Bull.UnrecoverableError('Local account deletion requires an outbox coordinator');
	}

	{ // Delete notes
		let cursor: MiNote['id'] | null = null;

		for (;;) {
			const notes = await listNotesByUserIdWithPaginationFromDatabase(deps.db, user.id, {
				limit: 100,
				sinceId: cursor,
			});

			if (notes.length === 0) break;

			cursor = notes.at(-1)?.id ?? null;

			await deleteNotesByIdsFromDatabase(deps.db, notes.map(note => note.id));

			for (const note of notes) {
				await unindexNoteForHonoApi(deps, note);
			}
		}
	}

	{ // Delete files
		let cursor: MiDriveFile['id'] | null = null;

		for (;;) {
			const files = await listDriveFilesByUserIdWithPaginationFromDatabase(deps.db, user.id, {
				limit: 10,
				sinceId: cursor,
			});

			if (files.length === 0) break;

			cursor = files.at(-1)?.id ?? null;

			for (const file of files) {
				await deleteFileSyncForHonoApi(deps, file);
			}
		}
	}

	{
		// delete pages. Necessary for decrementing pageCount of notes.
		// NOTE: 元実装同様カーソルを使わない — 削除自体が次イテレーションの取得ウィンドウを進める。
		for (;;) {
			const pages = await listPagesByUserIdWithPaginationFromDatabase(deps.db, user.id, {
				limit: 100,
				order: 'asc',
			});

			if (pages.length === 0) break;

			for (const page of pages) {
				const result = await deletePageForHonoApi(deps, user, page.id);
				if (result.status !== 'ok') {
					throw new Error(`failed to delete page ${page.id}: ${result.status}`);
				}
			}
		}
	}

	{ // Send email notification
		const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id);
		if (profile.email && profile.emailVerified) {
			// 元実装同様、送信完了を待たない
			void deps.emailService.sendEmail(profile.email, 'Account deleted',
				'Your account has been deleted.',
				'Your account has been deleted.');
		}
	}

	// soft指定されている場合は物理削除しない
	if (!job.data.soft) {
		await deleteUserByIdFromDatabase(deps.db, job.data.user.id);
	}

	return 'Account deleted';
}
