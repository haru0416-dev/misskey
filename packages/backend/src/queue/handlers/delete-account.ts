/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Bull from 'bullmq';
import type { EmailService } from '@/core/email/email-service.js';
import { listPagesByUserIdWithPaginationFromDatabase } from '@/core/page/page-store.js';
import { listDriveFilesByUserIdWithPaginationFromDatabase } from '@/core/drive/drive-file-store.js';
import { deleteNotesByIdsFromDatabase, listNotesByUserIdWithPaginationFromDatabase } from '@/core/note/note-store.js';
import { deleteUserByIdFromDatabase, fetchUserByIdFromDatabase } from '@/core/user/user-store.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/user/user-profile-store.js';
import type { Config } from '@/config.js';
import type { DbQueue, DeliverQueue } from '@/core/queue/queues.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiMeta, MiUser } from '@/models/entities.js';
import type { MiNote } from '@/models/Note.js';
import type { DbUserDeleteJobData } from '@/core/queue/types.js';
import { deletePage } from '@/server/rest/page/pages.js';
import type { PageDependencies } from '@/server/rest/page/pages.js';
import { deleteFileSync } from './object-storage.js';
import type { QueueObjectStorageDependencies } from './object-storage.js';

export type QueueDeleteAccountDependencies = QueueObjectStorageDependencies &
	PageDependencies & {
		db: MiDrizzleDatabase;
		config: Config;
		meta: Pick<MiMeta, 'rootUserId'>;
		dbQueue: DbQueue;
		deliverQueue: DeliverQueue;
		emailService: Pick<EmailService, 'sendEmail'>;
		publishInternalEvent?: <K extends 'userChangeDeletedState'>(
			type: K,
			value: { id: MiUser['id']; isDeleted: true },
		) => void;
	};

export async function handleQueueDeleteAccount(
	deps: QueueDeleteAccountDependencies,
	data: DbUserDeleteJobData,
): Promise<string | void> {
	const user = await fetchUserByIdFromDatabase(deps.db, data.user.id);
	if (user == null) {
		return;
	}
	if (user.host == null && !data.soft && data.accountDeleteCoordinatorId == null) {
		throw new Bull.UnrecoverableError('Local account deletion requires an outbox coordinator');
	}

	{
		let cursor: MiNote['id'] | null = null;

		for (;;) {
			const notes = await listNotesByUserIdWithPaginationFromDatabase(deps.db, user.id, {
				limit: 100,
				sinceId: cursor,
			});

			if (notes.length === 0) {
				break;
			}

			cursor = notes.at(-1)?.id ?? null;

			await deleteNotesByIdsFromDatabase(
				deps.db,
				notes.map((note) => note.id),
			);
		}
	}

	{
		let cursor: MiDriveFile['id'] | null = null;

		for (;;) {
			const files = await listDriveFilesByUserIdWithPaginationFromDatabase(deps.db, user.id, {
				limit: 10,
				sinceId: cursor,
			});

			if (files.length === 0) {
				break;
			}

			cursor = files.at(-1)?.id ?? null;

			for (const file of files) {
				await deleteFileSync(deps, file);
			}
		}
	}

	{
		// ページ削除はノートの pageCount を減らすために必要。
		// 削除で取得ウィンドウが進むため、カーソルを使わず先頭から再取得する。
		for (;;) {
			const pages = await listPagesByUserIdWithPaginationFromDatabase(deps.db, user.id, {
				limit: 100,
				order: 'asc',
			});

			if (pages.length === 0) {
				break;
			}

			for (const page of pages) {
				const result = await deletePage(deps, user, page.id);
				if (result.status !== 'ok') {
					throw new Error(`failed to delete page ${page.id}: ${result.status}`);
				}
			}
		}
	}

	{
		// アカウント削除通知は送信完了を待たない。
		const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id);
		if (profile.email && profile.emailVerified) {
			void deps.emailService.sendEmail(
				profile.email,
				'Account deleted',
				'Your account has been deleted.',
				'Your account has been deleted.',
			);
		}
	}

	if (!data.soft) {
		await deleteUserByIdFromDatabase(deps.db, data.user.id);
	}

	return 'Account deleted';
}
