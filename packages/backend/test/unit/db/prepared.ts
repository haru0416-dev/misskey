/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { fetchHashtagByNameFromDatabase, recordHashtagUsagesInDatabase } from '@/core/hashtag/HashtagStore.js';
import { createNoteInDatabase, fetchNoteByIdFromDatabase } from '@/core/note/NoteStore.js';
import {
	completeInlineDbOutboxJobs,
	enqueueInlineDbJobsInOutbox,
	fetchQueueOutboxByIdFromDatabase,
} from '@/core/queue/QueueOutboxStore.js';
import {
	createUserWithProfileAndPublickeyInDatabase,
	fetchUserByIdOrFailFromDatabase,
	incrementUserNotesCountAndUpdatedAtInDatabase,
} from '@/core/user/UserStore.js';
import {
	createWebhookInDatabase,
	listActiveWebhooksByUserIdAndEventFromDatabase,
} from '@/core/webhook/WebhookStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { DbNotePostCreateJobData } from '@/queue/types.js';

/*
 * 固定形 (executePreparedStatement) と従来の組み立て (行数が上限を超えたときの fallback) が
 * 同じ行を書くことを、実際に DB へ書いて読み戻して確かめる。SQL 文字列の一致ではなく結果で見るのは、
 * placeholder の値変換 (配列 / jsonb / timestamp) が組み立て時ではなく実行時に走るため。
 */
describe('db/prepared', () => {
	let runtime: RuntimeDependencies;
	let db: MiDrizzleDatabase;
	let userId: string;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		db = runtime.db;
		userId = genId();
		await createUserWithProfileAndPublickeyInDatabase(db, {
			user: { id: userId, username: `prepared${userId}`, usernameLower: `prepared${userId}` },
			profile: { userId },
		});
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	function fullNoteValues(id: string) {
		return {
			id,
			uri: null,
			url: null,
			fileIds: [genId()],
			replyId: null,
			renoteId: null,
			channelId: null,
			threadId: null,
			name: null,
			text: 'prepared "quoted" text\nwith newline',
			hasPoll: false,
			cw: null,
			tags: ['tag1', 'tag2'],
			emojis: ['blobcat'],
			userId,
			localOnly: false,
			reactionAcceptance: null,
			reactions: {},
			reactionAndUserPairCache: [],
			renoteCount: 0,
			repliesCount: 0,
			clippedCount: 0,
			pageCount: 0,
			visibility: 'public' as const,
			visibleUserIds: [],
			mentions: [],
			mentionedRemoteUsers: '[]',
			attachedFileTypes: ['image/png'],
			replyUserId: null,
			replyUserHost: null,
			renoteUserId: null,
			renoteUserHost: null,
			renoteChannelId: null,
			userHost: null,
		};
	}

	test('note insert round-trips arrays and jsonb inside a transaction', async () => {
		const outsideId = genId();
		const insideId = genId();
		await createNoteInDatabase(db, fullNoteValues(outsideId));
		await db.transaction(async (tx) => {
			await createNoteInDatabase(tx as MiDrizzleDatabase, fullNoteValues(insideId));
		});

		for (const id of [outsideId, insideId]) {
			const note = await fetchNoteByIdFromDatabase(db, id);
			expect(note).not.toBeNull();
			expect(note!.text).toBe('prepared "quoted" text\nwith newline');
			expect(note!.tags).toEqual(['tag1', 'tag2']);
			expect(note!.emojis).toEqual(['blobcat']);
			expect(note!.fileIds).toHaveLength(1);
			expect(note!.attachedFileTypes).toEqual(['image/png']);
			expect(note!.reactions).toEqual({});
			expect(note!.visibility).toBe('public');
		}
	});

	test('partial note values fall back to the dynamic insert', async () => {
		const id = genId();
		await createNoteInDatabase(db, { id, text: 'partial', userId, userHost: null, visibility: 'home' });
		const note = await fetchNoteByIdFromDatabase(db, id);
		expect(note?.text).toBe('partial');
		expect(note?.tags).toEqual([]);
	});

	test('notesCount increment applies the placeholder timestamp', async () => {
		const before = await fetchUserByIdOrFailFromDatabase(db, userId);
		const updatedAt = new Date('2026-09-03T01:02:03.000Z');
		await db.transaction(async (tx) => {
			await incrementUserNotesCountAndUpdatedAtInDatabase(tx as MiDrizzleDatabase, userId, updatedAt);
		});
		const after = await fetchUserByIdOrFailFromDatabase(db, userId);
		expect(after.notesCount).toBe(before.notesCount + 1);
		expect(after.updatedAt?.toISOString()).toBe(updatedAt.toISOString());
	});

	function jobData(noteId: string, stage: DbNotePostCreateJobData['stage']): DbNotePostCreateJobData {
		return { noteId, mentionedUserIds: [userId], reply: null, renote: null, silent: false, stage };
	}

	test.each([2, 17])('outbox enqueue with %d rows writes jsonb payloads and complete removes them', async (rows) => {
		const noteId = genId();
		const dataList = Array.from({ length: rows }, () => jobData(noteId, 'fanout'));
		const opts = { attempts: 12, backoff: { type: 'exponential', delay: 1000 } };
		const jobs = await db.transaction(async (tx) => {
			return await enqueueInlineDbJobsInOutbox(tx as MiDrizzleDatabase, 'notePostCreate', dataList, opts);
		});
		expect(jobs).toHaveLength(rows);

		const first = await fetchQueueOutboxByIdFromDatabase(db, jobs[0]!.outboxId);
		expect(first).toMatchObject({
			queue: 'db',
			name: 'notePostCreate',
			kind: 'job',
			state: 'publishing',
			externalJobId: `outbox-${jobs[0]!.outboxId}`,
			leaseToken: jobs[0]!.leaseToken,
			data: dataList[0],
			opts,
		});
		expect(first!.leaseExpiresAt).toBeInstanceOf(Date);

		await completeInlineDbOutboxJobs(db, jobs);
		for (const job of jobs) {
			expect(await fetchQueueOutboxByIdFromDatabase(db, job.outboxId)).toBeNull();
		}
	});

	test.each([1, 2, 17])(
		'hashtag usage with %d entries upserts through the same rows as the dynamic path',
		async (rows) => {
			const names = Array.from({ length: rows }, () => `prepared${genId()}`);
			const record = (uid: string) =>
				recordHashtagUsagesInDatabase(db, {
					entries: names.map((name) => ({ id: genId(), name })),
					userId: uid,
					isLocalUser: true,
					isRemoteUser: false,
					isUserAttached: false,
					increment: true,
				});

			await record(userId);
			const inserted = await fetchHashtagByNameFromDatabase(db, names[0]!);
			expect(inserted).toMatchObject({
				mentionedUserIds: [userId],
				mentionedUsersCount: 1,
				mentionedLocalUserIds: [userId],
				mentionedLocalUsersCount: 1,
				mentionedRemoteUserIds: [],
				mentionedRemoteUsersCount: 0,
				attachedUserIds: [],
				attachedUsersCount: 0,
			});

			// 同じユーザーの再投稿は数えない
			await record(userId);
			expect((await fetchHashtagByNameFromDatabase(db, names[rows - 1]!))?.mentionedUsersCount).toBe(1);

			// 別ユーザーは追記される
			const otherId = genId();
			await record(otherId);
			const updated = await fetchHashtagByNameFromDatabase(db, names[0]!);
			expect(updated?.mentionedUserIds).toEqual([userId, otherId]);
			expect(updated?.mentionedUsersCount).toBe(2);
			expect(updated?.mentionedLocalUsersCount).toBe(2);
		},
	);

	test('active webhook lookup filters by user, active flag and event', async () => {
		const otherUserId = genId();
		await createUserWithProfileAndPublickeyInDatabase(db, {
			user: { id: otherUserId, username: `preparedwh${otherUserId}`, usernameLower: `preparedwh${otherUserId}` },
			profile: { userId: otherUserId },
		});
		const base = { url: 'https://example.com/hook', secret: 's', name: 'hook' };
		const matching = await createWebhookInDatabase(db, { ...base, id: genId(), userId, on: ['note', 'follow'] });
		await createWebhookInDatabase(db, { ...base, id: genId(), userId, on: ['follow'] });
		await createWebhookInDatabase(db, { ...base, id: genId(), userId, on: ['note'], active: false });
		await createWebhookInDatabase(db, { ...base, id: genId(), userId: otherUserId, on: ['note'] });

		const rows = await listActiveWebhooksByUserIdAndEventFromDatabase(db, userId, 'note');
		expect(rows.map((row) => row.id)).toEqual([matching.id]);
		expect(await listActiveWebhooksByUserIdAndEventFromDatabase(db, userId, 'reaction')).toEqual([]);
	});
});
