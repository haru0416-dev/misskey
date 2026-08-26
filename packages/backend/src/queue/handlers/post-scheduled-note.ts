/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Bull from 'bullmq';
import { eq } from 'drizzle-orm';
import { fetchNoteDraftWithUserByIdFromDatabase } from '@/core/note/NoteDraftStore.js';
import { noteDraft, type NoteDraftRow } from '@/db/schema/note-draft.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiNoteDraft } from '@/models/NoteDraft.js';
import type { PostScheduledNoteJobData } from '@/queue/types.js';
import { fetchAndCreateNoteForHonoApi, type HonoApiNotesCreateDependencies } from '@/server/rest/note/notes-create.js';
import {
	createScheduledNotePostFailedNotification,
	createScheduledNotePostedNotification,
	type HonoApiNotificationDependencies,
} from '@/server/rest/notification/notification.js';

export type HonoQueuePostScheduledNoteDependencies = HonoApiNotesCreateDependencies & HonoApiNotificationDependencies;

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

export async function handleHonoQueuePostScheduledNote(
	deps: HonoQueuePostScheduledNoteDependencies,
	job: Bull.Job<PostScheduledNoteJobData>,
): Promise<void> {
	const draft = await fetchNoteDraftWithUserByIdFromDatabase(deps.db, job.data.noteDraftId);
	if (
		draft == null ||
		draft.user == null ||
		draft.scheduledAt == null ||
		draft.scheduledAt.getTime() > Date.now() ||
		(job.data.scheduledAt != null && draft.scheduledAt.getTime() !== job.data.scheduledAt) ||
		!draft.isActuallyScheduled
	) {
		return;
	}

	try {
		const note = await fetchAndCreateNoteForHonoApi(
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
					// draftをlockしてrevisionを再検証し、note作成とdraft削除を同一transactionで確定する。
					// この順序により、編集前のjobや並行jobによる二重投稿を防ぐ。
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
		if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
			createScheduledNotePostFailedNotification(deps, draft.userId, draft.id);
		}
		throw error;
	}
}
