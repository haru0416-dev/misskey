/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env['NODE_ENV'] = 'test';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type * as Bull from 'bullmq';
import { loadConfig } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool, type MiDrizzleDatabase, type MiDrizzlePool } from '@/drizzle.js';
import { createUserInDatabase, createUserWithProfileAndPublickeyInDatabase } from '@/core/UserStore.js';
import { createNoteInDatabase, createNoteWithPollInDatabase } from '@/core/NoteStore.js';
import { createPollVoteInDatabase } from '@/core/PollVoteStore.js';
import { genId } from '@/misc/id/gen-id.js';
import {
	handleHonoQueueEndedPollNotification,
	type HonoQueueEndedPollNotificationDependencies,
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
	let deps: HonoQueueEndedPollNotificationDependencies;
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
			} as unknown as HonoQueueEndedPollNotificationDependencies['redis'],
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
		await handleHonoQueueEndedPollNotification(deps, fakeJob({ noteId }));

		// createPollEndedNotification は元実装 (NotificationService.createNotification) 同様
		// trackPromiseによるfire-and-forgetのため、publishMainStream呼び出し完了をポーリングで待つ。
		for (let i = 0; i < 20 && publishedNotifications.length < 2; i++) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		expect(publishedNotifications.filter((n) => n.userId === authorId && n.type === 'notification')).toHaveLength(1);
		expect(publishedNotifications.filter((n) => n.userId === voterId && n.type === 'notification')).toHaveLength(1);
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
		await handleHonoQueueEndedPollNotification(deps, fakeJob({ noteId }));

		expect(publishedNotifications).toHaveLength(0);
	});

	test('存在しないnoteIdは何もしない', async () => {
		publishedNotifications.length = 0;
		await handleHonoQueueEndedPollNotification(deps, fakeJob({ noteId: genId() }));
		expect(publishedNotifications).toHaveLength(0);
	});
});
