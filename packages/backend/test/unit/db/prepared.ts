/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { eq, getTableColumns, getTableName, sql } from 'drizzle-orm';
import { alias, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { defineQueryPlan } from '@/db/prepared.js';
import { loadConfig } from '@/config.js';
import { fetchHashtagByNameFromDatabase, recordHashtagUsagesInDatabase } from '@/core/hashtag/HashtagStore.js';
import {
	createNoteInDatabase,
	createNoteWithAuthorAndInlineJobsInDatabase,
	fetchNoteByIdFromDatabase,
	fetchNotePostCreateSnapshotFromDatabase,
	listHydratedNotesByIdsFromDatabase,
} from '@/core/note/NoteStore.js';
import {
	runInlineDbOutboxJobs,
	enqueueInlineDbJobsInOutbox,
	fetchQueueOutboxByIdFromDatabase,
} from '@/core/queue/QueueOutboxStore.js';
import { createUserWithProfileAndPublickeyInDatabase, fetchUserByIdOrFailFromDatabase } from '@/core/user/UserStore.js';
import {
	createWebhookInDatabase,
	listActiveWebhooksByUserIdAndEventFromDatabase,
} from '@/core/webhook/WebhookStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { DbNotePostCreateJobData } from '@/queue/types.js';
import { queueOutbox } from '@/db/schema/queue-outbox.js';
import { following } from '@/db/schema/following.js';
import { cacheVersion } from '@/db/schema/cache-version.js';
import { user as userTable } from '@/db/schema/user.js';

/*
 * 固定形の plan と通常の組み立て (行数が上限を超えたときの fallback) が
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

	function postCreateJob(noteId: string): DbNotePostCreateJobData {
		return { noteId, mentionedUserIds: [], reply: null, renote: null, silent: false, stage: 'fanout' };
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

	test('compound note persistence commits the author count and recovery job together', async () => {
		const before = await fetchUserByIdOrFailFromDatabase(db, userId);
		const id = genId();
		const values = fullNoteValues(id);
		const { author, jobs } = await createNoteWithAuthorAndInlineJobsInDatabase(db, values, [postCreateJob(id)], {});
		expect((await fetchNoteByIdFromDatabase(db, id))?.text).toBe(values.text);
		expect(author.notesCount).toBe(before.notesCount + 1);
		expect(author.updatedAt).toBeInstanceOf(Date);
		expect((await fetchUserByIdOrFailFromDatabase(db, userId)).notesCount).toBe(before.notesCount + 1);
		expect((await fetchQueueOutboxByIdFromDatabase(db, jobs[0]!.outboxId))?.data).toMatchObject({ noteId: id });

		const rejectedId = genId();
		await expect(
			createNoteWithAuthorAndInlineJobsInDatabase(
				db,
				{ ...fullNoteValues(rejectedId), channelId: genId() },
				[postCreateJob(rejectedId)],
				{},
			),
		).rejects.toMatchObject({ cause: { code: '23503' } });
		expect(await fetchNoteByIdFromDatabase(db, rejectedId)).toBeNull();
		expect((await fetchUserByIdOrFailFromDatabase(db, userId)).notesCount).toBe(before.notesCount + 1);
		expect(
			await db
				.select({ id: queueOutbox.id })
				.from(queueOutbox)
				.where(sql`${queueOutbox.data}->>'noteId' = ${rejectedId}`),
		).toEqual([]);
	});

	test('runtime defaults and onUpdate functions are evaluated for each mutation', async () => {
		let generatedAt = new Date('2026-09-03T01:02:03.000Z');
		const generated = pgTable('prepared_dynamic_defaults', {
			id: text('id').primaryKey(),
			label: text('label').notNull(),
			generatedAt: timestamp('generatedAt', { withTimezone: true })
				.notNull()
				.$defaultFn(() => generatedAt)
				.$onUpdateFn(() => generatedAt),
		});
		const insertPlan = defineQueryPlan((currentDb) => {
			const selection = getTableColumns(generated);
			return {
				query: currentDb
					.insert(generated)
					.values({ id: sql.placeholder('id'), label: sql.placeholder('label') })
					.returning(selection),
				selection,
				metadata: { type: 'insert', tables: [getTableName(generated)] },
				mutationTables: [generated],
			};
		});
		const updatePlan = defineQueryPlan((currentDb) => {
			const selection = getTableColumns(generated);
			return {
				query: currentDb
					.update(generated)
					.set({ label: sql`${sql.param(sql.placeholder('label'), generated.label)}` })
					.where(eq(generated.id, sql.placeholder('id')))
					.returning(selection),
				selection,
				metadata: { type: 'insert', tables: [getTableName(generated)] },
				mutationTables: [generated],
			};
		});
		await db.transaction(async (tx) => {
			await tx.execute(sql`CREATE TEMPORARY TABLE ${generated} (
				"id" text PRIMARY KEY, "label" text NOT NULL, "generatedAt" timestamptz NOT NULL
			) ON COMMIT DROP`);
			expect((await insertPlan.execute(tx, { id: 'first', label: 'initial' }))[0]?.generatedAt).toEqual(generatedAt);
			generatedAt = new Date('2026-09-04T04:05:06.000Z');
			expect((await insertPlan.execute(tx, { id: 'second', label: 'initial' }))[0]?.generatedAt).toEqual(generatedAt);
			generatedAt = new Date('2026-09-05T07:08:09.000Z');
			expect((await updatePlan.execute(tx, { id: 'first', label: 'updated' }))[0]?.generatedAt).toEqual(generatedAt);
			generatedAt = new Date('2026-09-06T10:11:12.000Z');
			expect((await updatePlan.execute(tx, { id: 'second', label: 'updated' }))[0]?.generatedAt).toEqual(generatedAt);
		});
	});

	test('shared plans read their own concurrent transaction and discard rolled back rows', async () => {
		const ids = [genId(), genId()];
		// 同じ plan を root session で使った後も、実行先はその都度の tx でなければならない。
		expect(await fetchNoteByIdFromDatabase(db, ids[0]!)).toBeNull();
		let release!: () => void;
		const ready = new Promise<void>((resolve) => {
			release = resolve;
		});
		let inserted = 0;
		const rollback = new Error('discard concurrent transaction');
		await Promise.all(
			ids.map(async (id, index) => {
				await expect(
					db.transaction(async (tx) => {
						try {
							await createNoteInDatabase(tx, { ...fullNoteValues(id), text: `transaction ${index}` });
							if (++inserted === ids.length) release();
							await ready;
							expect((await fetchNoteByIdFromDatabase(tx, id))?.text).toBe(`transaction ${index}`);
							expect(await fetchNoteByIdFromDatabase(tx, ids[1 - index]!)).toBeNull();
							throw rollback;
						} finally {
							release();
						}
					}),
				).rejects.toBe(rollback);
			}),
		);
		for (const id of ids) expect(await fetchNoteByIdFromDatabase(db, id)).toBeNull();
	});

	test('savepoint rollback preserves outer note, counter and outbox writes', async () => {
		const before = await fetchUserByIdOrFailFromDatabase(db, userId);
		const outerId = genId();
		const innerId = genId();
		const rollback = new Error('discard savepoint');
		await db.transaction(async (tx) => {
			const outer = await createNoteWithAuthorAndInlineJobsInDatabase(
				tx,
				fullNoteValues(outerId),
				[postCreateJob(outerId)],
				{},
			);
			expect(outer.author.notesCount).toBe(before.notesCount + 1);
			await expect(
				tx.transaction(async (savepoint) => {
					const inner = await createNoteWithAuthorAndInlineJobsInDatabase(
						savepoint,
						fullNoteValues(innerId),
						[postCreateJob(innerId)],
						{},
					);
					expect((await fetchNoteByIdFromDatabase(savepoint, innerId))?.id).toBe(innerId);
					expect(inner.author.notesCount).toBe(before.notesCount + 2);
					expect((await fetchQueueOutboxByIdFromDatabase(savepoint, inner.jobs[0]!.outboxId))?.data).toMatchObject({
						noteId: innerId,
					});
					throw rollback;
				}),
			).rejects.toBe(rollback);
			expect(await fetchNoteByIdFromDatabase(tx, innerId)).toBeNull();
			expect((await fetchNoteByIdFromDatabase(tx, outerId))?.id).toBe(outerId);
			expect((await fetchUserByIdOrFailFromDatabase(tx, userId)).notesCount).toBe(before.notesCount + 1);
		});
		expect(await fetchNoteByIdFromDatabase(db, innerId)).toBeNull();
		expect((await fetchNoteByIdFromDatabase(db, outerId))?.id).toBe(outerId);
		expect((await fetchUserByIdOrFailFromDatabase(db, userId)).notesCount).toBe(before.notesCount + 1);
		expect(
			await db
				.select({ id: queueOutbox.id })
				.from(queueOutbox)
				.where(sql`${queueOutbox.data}->>'noteId' = ${innerId}`),
		).toEqual([]);
	});

	test('post-create snapshots reflect current transaction followers and role generation without leaking rollback', async () => {
		const id = genId();
		const followerId = genId();
		await createUserWithProfileAndPublickeyInDatabase(db, {
			user: { id: followerId, username: `snapshot${followerId}`, usernameLower: `snapshot${followerId}` },
			profile: { userId: followerId },
		});
		await createNoteInDatabase(db, fullNoteValues(id));
		const before = await fetchNotePostCreateSnapshotFromDatabase(db, id);
		expect(before?.followers).toEqual([]);
		const rollback = new Error('discard post-create snapshot changes');
		await expect(
			db.transaction(async (tx) => {
				await tx.insert(following).values({
					id: genId(),
					followeeId: userId,
					followerId,
					notify: 'normal',
					withReplies: true,
				});
				await tx
					.update(userTable)
					.set({ notesCount: sql`${userTable.notesCount} + 1` })
					.where(eq(userTable.id, userId));
				const [generation] = await tx
					.insert(cacheVersion)
					.values({ key: 'roles', version: 1 })
					.onConflictDoUpdate({ target: cacheVersion.key, set: { version: sql`${cacheVersion.version} + 1` } })
					.returning({ version: cacheVersion.version });
				const current = await fetchNotePostCreateSnapshotFromDatabase(tx, id);
				expect(current?.user.notesCount).toBe(before!.user.notesCount + 1);
				expect(current?.rolesVersion).toBe(generation!.version);
				expect(current?.followers).toEqual([
					{
						followerId,
						followerHost: null,
						isFollowerHibernated: false,
						withReplies: true,
						notify: 'normal',
						followerSharedInbox: null,
						followerInbox: null,
					},
				]);
				throw rollback;
			}),
		).rejects.toBe(rollback);
		expect(await fetchNotePostCreateSnapshotFromDatabase(db, id)).toEqual(before);
		expect(await fetchNotePostCreateSnapshotFromDatabase(db, genId())).toBeNull();
	});

	test('hydrated plans decode nested rows and nullify absent left joins in the current transaction', async () => {
		const parentId = genId();
		const childId = genId();
		const tags = ['comma,quote"slash\\', 'plain'];
		const rollback = new Error('discard hydrated notes');
		await expect(
			db.transaction(async (tx) => {
				await createNoteInDatabase(tx, { ...fullNoteValues(parentId), tags, reactions: { like: 2 } });
				await createNoteInDatabase(tx, { ...fullNoteValues(childId), replyId: parentId, replyUserId: userId });
				const rows = await listHydratedNotesByIdsFromDatabase(tx, [parentId, childId]);
				const parent = rows.find((row) => row.id === parentId)!;
				const child = rows.find((row) => row.id === childId)!;
				expect(parent.reply).toBeNull();
				expect(parent.renote).toBeNull();
				expect(parent.channel).toBeNull();
				expect(child.reply?.id).toBe(parentId);
				expect(child.reply?.tags).toEqual(tags);
				expect(child.reply?.reactions).toEqual({ like: 2 });
				expect(child.reply?.user?.id).toBe(userId);
				expect(child.user?.id).toBe(userId);
				expect(child.renote).toBeNull();
				expect(child.channel).toBeNull();
				throw rollback;
			}),
		).rejects.toBe(rollback);
		expect(await listHydratedNotesByIdsFromDatabase(db, [parentId, childId])).toEqual([]);
	});

	test('compiled row mapping agrees with Drizzle for nested aliases, custom decoders and nullable joins', async () => {
		const joined = alias(userTable, 'mappedUser');
		const selection = {
			id: userTable.id,
			nested: {
				name: sql<string>`${userTable.username}`.mapWith((value) => String(value).toUpperCase()).as('mappedName'),
			},
			joined: { id: joined.id, name: joined.name },
			empty: sql<string | null>`NULL::text`.mapWith(() => {
				throw new Error('NULL must bypass the decoder');
			}),
		};
		const query = (currentDb: MiDrizzleDatabase) =>
			currentDb
				.select(selection)
				.from(userTable)
				.leftJoin(joined, eq(joined.id, sql.placeholder('joinedId')))
				.where(eq(userTable.id, sql.placeholder('userId')));
		const reference = query(db).prepare('mapper-reference');
		const plan = defineQueryPlan((currentDb) => ({
			query: query(currentDb),
			selection,
			joinsNotNullableMap: { user: true, mappedUser: false },
			metadata: { type: 'select', tables: [getTableName(userTable)] },
		}));
		for (const joinedId of [genId(), userId]) {
			const values = { userId, joinedId };
			const actual = await plan.execute(db, values);
			expect(actual).toEqual(await reference.execute(values));
			expect(actual[0]?.empty).toBeNull();
			expect(actual[0]?.joined).toEqual(joinedId === userId ? { id: userId, name: null } : null);
		}
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

		await runInlineDbOutboxJobs(db, jobs, async () => {});
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
