/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type * as Bull from 'bullmq';
import { loadConfig } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool, type MiDrizzleDatabase, type MiDrizzlePool } from '@/drizzle.js';
import { createUserInDatabase, createUserWithProfileAndPublickeyInDatabase } from '@/core/user/UserStore.js';
import { createNoteInDatabase, createNoteWithPollInDatabase } from '@/core/note/NoteStore.js';
import { createPollVoteInDatabase } from '@/core/note/PollVoteStore.js';
import { genId } from '@/misc/id/gen-id.js';
import {
	handleQueueEndedPollNotification,
	type QueueEndedPollNotificationDependencies,
} from '@/queue/handlers/ended-poll-notification.js';
import type { EndedPollNotificationJobData } from '@/queue/types.js';
import type { Config } from '@/config.js';

function fakeJob(data: EndedPollNotificationJobData): Bull.Job<EndedPollNotificationJobData> {
	return { data } as Bull.Job<EndedPollNotificationJobData>;
}

describe('hono-queue-ended-poll-notification', () => {
	let pool: MiDrizzlePool;
	let db: MiDrizzleDatabase;
	let config: Config;
	let deps: QueueEndedPollNotificationDependencies;
	const publishedNotifications: { userId: string; type: string }[] = [];

	beforeAll(() => {
		config = loadConfig();
		pool = createDrizzlePool(config);
		db = createDrizzleDatabase(pool, config);
		deps = {
			config,
			db,
			redis: {
				xadd: async () => '0-1',
				get: async () => null,
			} as unknown as QueueEndedPollNotificationDependencies['redis'],
			meta: { enableServiceWorker: false, swPublicKey: null, swPrivateKey: null },
			publishMainStream: (userId, type) => {
				publishedNotifications.push({ userId, type });
			},
		};
	});

	afterAll(async () => {
		await pool.end();
	});

	test('投稿者とローカル投票者にpollEnded通知を送る', async () => {
		const authorId = genId();
		await createUserWithProfileAndPublickeyInDatabase(db, {
			user: {
				id: authorId,
				username: `honoqueueepn${authorId}`,
				usernameLower: `honoqueueepn${authorId}`.toLowerCase(),
			},
			profile: { userId: authorId },
		});

		const voterId = genId();
		await createUserWithProfileAndPublickeyInDatabase(db, {
			user: {
				id: voterId,
				username: `honoqueueepn${voterId}`,
				usernameLower: `honoqueueepn${voterId}`.toLowerCase(),
			},
			profile: { userId: voterId },
		});

		const noteId = genId();
		await createNoteWithPollInDatabase(
			db,
			{
				id: noteId,
				text: 'hono-queue-ended-poll-notification test',
				userId: authorId,
				userHost: null,
				visibility: 'public',
				hasPoll: true,
			},
			{
				noteId,
				multiple: false,
				choices: ['a', 'b'],
				votes: [0, 0],
				noteVisibility: 'public',
				userId: authorId,
				userHost: null,
			},
		);
		await createPollVoteInDatabase(db, { id: genId(), noteId, userId: voterId, choice: 0 });

		publishedNotifications.length = 0;
		await handleQueueEndedPollNotification(deps, fakeJob({ noteId }));

		// trackPromise による fire-and-forget のため、publishMainStream の呼び出し完了を待つ。
		await vi.waitFor(
			() => {
				expect(publishedNotifications.filter((n) => n.userId === authorId && n.type === 'notification')).toHaveLength(
					1,
				);
				expect(publishedNotifications.filter((n) => n.userId === voterId && n.type === 'notification')).toHaveLength(1);
			},
			{ timeout: 5_000, interval: 100 },
		);
	});

	test('hasPollがfalseのノートは何もしない', async () => {
		const userId = genId();
		await createUserInDatabase(db, {
			id: userId,
			username: `honoqueueepn${userId}`,
			usernameLower: `honoqueueepn${userId}`.toLowerCase(),
		});

		const noteId = genId();
		await createNoteInDatabase(db, {
			id: noteId,
			text: 'no poll here',
			userId,
			userHost: null,
			visibility: 'public',
		});

		publishedNotifications.length = 0;
		await handleQueueEndedPollNotification(deps, fakeJob({ noteId }));

		expect(publishedNotifications).toHaveLength(0);
	});

	test('存在しないnoteIdは何もしない', async () => {
		publishedNotifications.length = 0;
		await handleQueueEndedPollNotification(deps, fakeJob({ noteId: genId() }));
		expect(publishedNotifications).toHaveLength(0);
	});
});
