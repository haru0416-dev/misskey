/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { eq } from 'drizzle-orm';
import { fetchNoteDraftWithUserByIdFromDatabase } from '@/core/note/note-draft-store.js';
import { noteDraft } from '@/db/schema/note-draft.js';
import type { NoteDraftRow } from '@/db/schema/note-draft.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiNoteDraft } from '@/models/NoteDraft.js';
import type { PostScheduledNoteJobData } from '@/core/queue/types.js';
import { fetchAndCreateNote } from '@/core/note/note-creation-service.js';
import type { NoteCreationDependencies } from '@/core/note/note-creation-service.js';
import {
	createScheduledNotePostFailedNotification,
	createScheduledNotePostedNotification,
} from '@/core/notification/notification.js';
import type { NotificationDependencies } from '@/core/notification/notification.js';

export type QueuePostScheduledNoteDependencies = NoteCreationDependencies & NotificationDependencies;

class ScheduledNoteDraftUnavailableError extends Error {}

function scheduledNoteDraftFingerprint(draft: MiNoteDraft | NoteDraftRow): string {
	return JSON.stringify({
		replyId: draft.replyId,
		renoteId: draft.renoteId,
		text: draft.text,
		cw: draft.cw,
		userId: draft.userId,
		localOnly: draft.localOnly,
		reactionAcceptance: draft.reactionAcceptance,
		visibility: draft.visibility,
		fileIds: draft.fileIds,
		visibleUserIds: draft.visibleUserIds,
		channelId: draft.channelId,
		hasPoll: draft.hasPoll,
		pollChoices: draft.pollChoices,
		pollMultiple: draft.pollMultiple,
		pollExpiresAt: draft.pollExpiresAt,
		pollExpiredAfter: draft.pollExpiredAfter,
		scheduledAt: draft.scheduledAt,
		isActuallyScheduled: draft.isActuallyScheduled,
	});
}

export async function handleQueuePostScheduledNote(
	deps: QueuePostScheduledNoteDependencies,
	data: PostScheduledNoteJobData,
	isFinalAttempt: boolean,
): Promise<void> {
	const draft = await fetchNoteDraftWithUserByIdFromDatabase(deps.db, data.noteDraftId);
	if (
		draft == null ||
		draft.user == null ||
		draft.scheduledAt == null ||
		draft.scheduledAt.getTime() > Date.now() ||
		(data.scheduledAt != null && draft.scheduledAt.getTime() !== data.scheduledAt) ||
		!draft.isActuallyScheduled
	) {
		return;
	}

	try {
		const note = await fetchAndCreateNote(
			deps,
			draft.user,
			{
				createdAt: new Date(),
				fileIds: draft.fileIds,
				poll: draft.hasPoll
					? {
							choices: draft.pollChoices,
							multiple: draft.pollMultiple,
							expiresAt: draft.pollExpiredAfter
								? new Date(Date.now() + draft.pollExpiredAfter)
								: draft.pollExpiresAt
									? new Date(draft.pollExpiresAt)
									: null,
						}
					: null,
				text: draft.text ?? null,
				replyId: draft.replyId,
				renoteId: draft.renoteId,
				cw: draft.cw,
				localOnly: draft.localOnly,
				reactionAcceptance: draft.reactionAcceptance,
				visibility: draft.visibility,
				visibleUserIds: draft.visibleUserIds,
				channelId: draft.channelId,
			},
			async (insert) =>
				deps.db.transaction(async (transaction) => {
					// 下書きをロックして投稿内容と予約状態を再検証し、投稿作成と下書き削除を同じ transaction で確定する。
					// 編集済み・削除済みの下書きからの投稿や、並行ジョブによる二重投稿を防ぐ。
					const [currentDraft] = await transaction
						.select()
						.from(noteDraft)
						.where(eq(noteDraft.id, draft.id))
						.for('update')
						.limit(1);

					if (
						currentDraft == null ||
						scheduledNoteDraftFingerprint(currentDraft) !== scheduledNoteDraftFingerprint(draft)
					) {
						throw new ScheduledNoteDraftUnavailableError();
					}

					const note = await insert(transaction as MiDrizzleDatabase);
					await transaction.delete(noteDraft).where(eq(noteDraft.id, draft.id));
					return note;
				}),
		);

		createScheduledNotePostedNotification(deps, draft.userId, note.id);
	} catch (error) {
		if (error instanceof ScheduledNoteDraftUnavailableError) {
			return;
		}
		if (isFinalAttempt) {
			createScheduledNotePostFailedNotification(deps, draft.userId, draft.id);
		}
		throw error;
	}
}
