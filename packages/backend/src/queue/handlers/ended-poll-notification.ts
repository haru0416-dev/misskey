/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Bull from 'bullmq';
import { fetchNoteByIdFromDatabase } from '@/core/note/NoteStore.js';
import { listLocalPollVoterIdsByNoteIdFromDatabase } from '@/core/note/PollVoteStore.js';
import { listUserProfilesByUserIdsFromDatabase } from '@/core/user/UserProfileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { EndedPollNotificationJobData } from '@/queue/types.js';
import {
	createPollEndedNotification,
	type HonoApiNotificationDependencies,
} from '@/server/rest/notification/notification.js';

export type HonoQueueEndedPollNotificationDependencies = HonoApiNotificationDependencies & {
	db: MiDrizzleDatabase;
};

/**
 * キュープロセッサーは認証・レート制限の境界外で動作するため、
 * ユーザープロフィールをプロセスローカルキャッシュに保持せず直接DBから読む。
 */
export async function handleHonoQueueEndedPollNotification(
	deps: HonoQueueEndedPollNotificationDependencies,
	job: Bull.Job<EndedPollNotificationJobData>,
): Promise<void> {
	const note = await fetchNoteByIdFromDatabase(deps.db, job.data.noteId);
	if (note == null || !note.hasPoll) {
		return;
	}

	const voterIds = await listLocalPollVoterIdsByNoteIdFromDatabase(deps.db, note.id);
	const userIds = [...new Set([note.userId, ...voterIds])];

	for (let offset = 0; offset < userIds.length; offset += 100) {
		const profiles = await listUserProfilesByUserIdsFromDatabase(deps.db, userIds.slice(offset, offset + 100));
		await Promise.all(
			profiles
				.filter((profile) => profile.userHost === null)
				.map((profile) => createPollEndedNotification(deps, profile.userId, note.id, profile)),
		);
	}
}
