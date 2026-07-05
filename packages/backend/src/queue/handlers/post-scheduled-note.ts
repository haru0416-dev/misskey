/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Bull from 'bullmq';
import { deleteNoteDraftByIdFromDatabase, fetchNoteDraftWithUserByIdFromDatabase } from '@/core/NoteDraftStore.js';
import type { PostScheduledNoteJobData } from '@/queue/types.js';
import { fetchAndCreateNoteForHonoApi, type HonoApiNotesCreateDependencies } from '../../server/rest/notes-create.js';
import {
	createScheduledNotePostFailedNotification,
	createScheduledNotePostedNotification,
	type HonoApiNotificationDependencies,
} from '../../server/rest/notification.js';

export type HonoQueuePostScheduledNoteDependencies = HonoApiNotesCreateDependencies & HonoApiNotificationDependencies;

/** PostScheduledNoteProcessorService.process 相当。 */
export async function handleHonoQueuePostScheduledNote(
	deps: HonoQueuePostScheduledNoteDependencies,
	job: Bull.Job<PostScheduledNoteJobData>,
): Promise<void> {
	const draft = await fetchNoteDraftWithUserByIdFromDatabase(deps.db, job.data.noteDraftId);
	if (draft == null || draft.user == null || draft.scheduledAt == null || !draft.isActuallyScheduled) {
		return;
	}

	try {
		const note = await fetchAndCreateNoteForHonoApi(deps, draft.user, {
			createdAt: new Date(),
			fileIds: draft.fileIds,
			poll: draft.hasPoll ? {
				choices: draft.pollChoices,
				multiple: draft.pollMultiple,
				expiresAt: draft.pollExpiredAfter ? new Date(Date.now() + draft.pollExpiredAfter) : draft.pollExpiresAt ? new Date(draft.pollExpiresAt) : null,
			} : null,
			text: draft.text ?? null,
			replyId: draft.replyId,
			renoteId: draft.renoteId,
			cw: draft.cw,
			localOnly: draft.localOnly,
			reactionAcceptance: draft.reactionAcceptance,
			visibility: draft.visibility,
			visibleUserIds: draft.visibleUserIds,
			channelId: draft.channelId,
		});

		void deleteNoteDraftByIdFromDatabase(deps.db, draft.id);

		createScheduledNotePostedNotification(deps, draft.userId, note.id);
	} catch {
		createScheduledNotePostFailedNotification(deps, draft.userId, draft.id);
	}
}
