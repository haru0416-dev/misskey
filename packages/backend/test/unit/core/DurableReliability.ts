/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { loadConfig } from '@/config.js';
import { deleteNotesByIdsFromDatabase } from '@/core/note/NoteStore.js';
import { note as noteTable } from '@/db/schema/note.js';
import { FanoutTimelinePush } from '@/server/rest/note/fanout-timeline-push.js';
import { createNotePostProcessing } from '@/core/note/NotePostProcessing.js';
import { createAntennaInDatabase, deleteAntennaFromDatabase } from '@/core/antenna/AntennaStore.js';
import { createFollowingInDatabase } from '@/core/user/FollowingStore.js';
import { listModerationLogsFromDatabase } from '@/core/moderation/ModerationLogStore.js';
import {
	createUserWithProfileAndPublickeyInDatabase,
	deleteUserByIdFromDatabase,
	fetchUserByIdOrFailFromDatabase,
	updateUserInDatabase,
} from '@/core/user/UserStore.js';
import { queueOutbox } from '@/db/schema/queue-outbox.js';
import { following } from '@/db/schema/following.js';
import { runInRequestScope } from '@/misc/request-scope.js';
import { genId } from '@/misc/id/gen-id.js';
import type { DbQueue } from '@/core/queue/queues.js';
import type { DbUserSuspensionPostEffectsJobData } from '@/queue/types.js';
import type { MiLocalUser } from '@/models/User.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import {
	handleApiAdminSuspendUser,
	handleApiAdminUnsuspendUser,
	handleQueueUserSuspensionPostEffects,
} from '@/server/rest/admin/admin-user-suspension.js';
import type { ApiAdminUserSuspensionDependencies } from '@/server/rest/admin/admin-user-suspension.js';
import { createNote } from '@/core/note/NoteCreationService.js';
import type { NoteCreationDependencies } from '@/core/note/NoteCreationService.js';
import { handleQueueDeliver } from '@/queue/handlers/deliver.js';
import { handleApiNotesCreate } from '@/server/rest/note/notes-create.js';
import { handleQueueRelationshipUnfollow } from '@/queue/handlers/relationship.js';
import {
	resolveNotificationStreamId,
	toXListId,
	xaddApiNotification,
} from '@/server/rest/notification/notification.js';

describe('durable reliability boundaries', () => {
	let runtime: RuntimeDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	async function createLocalUser(prefix: string) {
		const id = genId();
		return (await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: { id, username: `${prefix}${id}`, usernameLower: `${prefix}${id}` },
			profile: { userId: id },
		})) as MiLocalUser;
	}

	test('suspension commits state, log and outbox, and an older job cannot apply after unsuspend', async () => {
		const moderator = await createLocalUser('durablemoderator');
		const target = await createLocalUser('durabletarget');
		const publishInternalEvent = vi.fn().mockImplementationOnce(() => {
			throw new Error('injected inline side-effect failure');
		});
		const deps = {
			...runtime,
			publishInternalEvent,
		} as unknown as ApiAdminUserSuspensionDependencies;

		try {
			await handleApiAdminSuspendUser(deps, moderator, { userId: target.id });
			expect((await fetchUserByIdOrFailFromDatabase(runtime.db, target.id)).isSuspended).toBe(true);
			const [suspendOutbox] = await runtime.db
				.select()
				.from(queueOutbox)
				.where(eq(queueOutbox.name, 'userSuspensionPostEffects'));
			expect(suspendOutbox).toBeDefined();

			await handleApiAdminUnsuspendUser(deps, moderator, { userId: target.id });
			expect((await fetchUserByIdOrFailFromDatabase(runtime.db, target.id)).isSuspended).toBe(false);
			const [unsuspendLog] = await listModerationLogsFromDatabase(runtime.db, {
				limit: 1,
				order: 'desc',
				type: 'unsuspend',
				search: target.id,
			});
			expect(unsuspendLog).toBeDefined();
			expect((await fetchUserByIdOrFailFromDatabase(runtime.db, target.id)).suspensionTransitionId).toBe(
				unsuspendLog!.id,
			);
			await deleteUserByIdFromDatabase(runtime.db, moderator.id);
			await updateUserInDatabase(runtime.db, target.id, { updatedAt: new Date(Date.now() + 1000) });
			publishInternalEvent.mockClear();
			await handleQueueUserSuspensionPostEffects(deps, {
				userId: target.id,
				isSuspended: false,
				transitionedAt: new Date().toISOString(),
				transitionId: unsuspendLog!.id,
			});
			expect(publishInternalEvent).toHaveBeenCalledWith('userChangeSuspendedState', {
				id: target.id,
				isSuspended: false,
			});
			publishInternalEvent.mockClear();

			await handleQueueUserSuspensionPostEffects(deps, suspendOutbox!.data as DbUserSuspensionPostEffectsJobData);
			expect(publishInternalEvent).not.toHaveBeenCalled();

			const guard = suspendOutbox!.data as DbUserSuspensionPostEffectsJobData;
			await expect(
				handleQueueDeliver(deps as unknown as Parameters<typeof handleQueueDeliver>[0], {
					user: { id: target.id },
					content: '{}',
					digest: 'test',
					to: 'https://remote.example.test/inbox',
					isSharedInbox: true,
					userStateGuard: guard,
				}),
			).resolves.toBe('skip (stale user state)');
			await expect(
				handleQueueRelationshipUnfollow(deps as unknown as Parameters<typeof handleQueueRelationshipUnfollow>[0], {
					from: { id: target.id },
					to: { id: moderator.id },
					userStateGuard: guard,
				}),
			).resolves.toBe('skip (stale user state)');
		} finally {
			await runtime.db.delete(queueOutbox).where(eq(queueOutbox.name, 'userSuspensionPostEffects'));
			await deleteUserByIdFromDatabase(runtime.db, target.id);
			await deleteUserByIdFromDatabase(runtime.db, moderator.id);
		}
	});

	test('note creation commits authoritative count and durable post-effects before returning during queue outage', async () => {
		const user = await createLocalUser('durablenote');
		const follower = await createLocalUser('durablefollower');
		await createFollowingInDatabase(runtime.db, {
			id: genId(),
			followeeId: user.id,
			followerId: follower.id,
			followeeHost: null,
			followerHost: null,
			notify: 'normal',
		});
		const addBulk = vi.fn().mockRejectedValue(new Error('injected queue outage'));
		const deps = {
			...runtime,
			dbQueue: { addBulk } as unknown as DbQueue,
		} as unknown as NoteCreationDependencies;
		let noteId: string | undefined;

		try {
			const note = await createNote(
				deps,
				user,
				{
					createdAt: new Date(Date.now() - 4 * 60 * 1000),
					text: 'durable note',
					reply: null,
					renote: null,
					files: [],
					poll: null,
					localOnly: true,
					reactionAcceptance: null,
					cw: null,
					visibility: 'home',
					visibleUsers: [],
					channel: null,
				},
				false,
			);
			noteId = note.id;
			expect((await fetchUserByIdOrFailFromDatabase(runtime.db, user.id)).notesCount).toBe(1);
			const rows = await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.name, 'notePostCreate'));
			const outboxes = rows.filter((row) => (row.data as { noteId?: string }).noteId === note.id);
			expect(outboxes).toHaveLength(0);
			expect((await fetchUserByIdOrFailFromDatabase(runtime.db, user.id)).notesCount).toBe(1);
			const timeline = await runtime.redisForTimelines.lrange(`list:userTimeline:${user.id}`, 0, -1);
			expect(timeline.filter((id) => id === note.id)).toHaveLength(1);
			expect(await runtime.redis.xlen(`notificationTimeline:${follower.id}`)).toBe(1);
		} finally {
			const rows = await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.name, 'notePostCreate'));
			const ids = rows.map((row) => row.id);
			if (ids.length > 0) {
				await runtime.db.delete(queueOutbox).where(inArray(queueOutbox.id, ids));
			}
			if (noteId != null) {
				await deleteNotesByIdsFromDatabase(runtime.db, [noteId]);
			}
			if (noteId != null) {
				await runtime.redisForTimelines.lrem(`list:userTimeline:${user.id}`, 0, noteId);
			}
			await runtime.redis.del(`notificationTimeline:${follower.id}`);
			await deleteUserByIdFromDatabase(runtime.db, follower.id);
			await deleteUserByIdFromDatabase(runtime.db, user.id);
		}
	});

	test('HTTP creation commits timelines and antennas before responding while shutdown owns pending analytics', async () => {
		const user = await createLocalUser('durablehttppost');
		const antennaId = genId();
		await createAntennaInDatabase(runtime.db, {
			id: antennaId,
			lastUsedAt: new Date(),
			userId: user.id,
			name: `durable${antennaId}`,
			src: 'users',
			users: [`@${user.username}`],
			withFile: false,
			isActive: true,
		});
		const analytics = Promise.withResolvers<void>();
		const analyticsStarted = Promise.withResolvers<void>();
		const update = vi.spyOn(runtime.chartWriters.notesChart, 'update').mockImplementation(async () => {
			analyticsStarted.resolve();
			await analytics.promise;
		});
		const errors: unknown[] = [];
		const notePostProcessing = createNotePostProcessing((error) => errors.push(error), 2);
		let noteId: string | undefined;
		let closed = false;
		const jobData = z.object({ noteId: z.string(), stage: z.string() });
		try {
			const response = await handleApiNotesCreate({ ...runtime, notePostProcessing }, user, {
				text: 'HTTP post lifecycle',
				localOnly: true,
				visibility: 'home',
			});
			noteId = z.object({ id: z.string() }).parse(response.createdNote).id;
			await analyticsStarted.promise;
			expect(await runtime.redisForTimelines.lrange(`list:userTimeline:${user.id}`, 0, -1)).toContain(noteId);
			expect(await runtime.redisForTimelines.lrange(`list:antennaTimeline:${antennaId}`, 0, -1)).toContain(noteId);
			const rows = await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.name, 'notePostCreate'));
			const pendingStages = rows
				.map((row) => jobData.parse(row.data))
				.filter((data) => data.noteId === noteId)
				.map((data) => data.stage);
			expect(pendingStages).not.toContain('fanout');
			expect(pendingStages).not.toContain('antennas');
			expect(pendingStages).not.toContain('analytics');
			const closing = notePostProcessing.close().then(() => {
				closed = true;
			});
			await Promise.resolve();
			expect(closed).toBe(false);
			analytics.resolve();
			await closing;
			expect(errors).toEqual([]);
		} finally {
			analytics.resolve();
			await notePostProcessing.close();
			update.mockRestore();
			const rows = await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.name, 'notePostCreate'));
			const ids = rows.filter((row) => jobData.parse(row.data).noteId === noteId).map((row) => row.id);
			if (ids.length > 0) await runtime.db.delete(queueOutbox).where(inArray(queueOutbox.id, ids));
			if (noteId != null) await deleteNotesByIdsFromDatabase(runtime.db, [noteId]);
			await runtime.redisForTimelines.del(`list:userTimeline:${user.id}`, `list:antennaTimeline:${antennaId}`);
			await deleteAntennaFromDatabase(runtime.db, antennaId);
			await deleteUserByIdFromDatabase(runtime.db, user.id);
		}
	});

	test('deferred notifications do not reuse the HTTP follower memo after unfollow', async () => {
		const user = await createLocalUser('scopedauthor');
		const follower = await createLocalUser('scopedfollower');
		const followingId = genId();
		await createFollowingInDatabase(runtime.db, {
			id: followingId,
			followeeId: user.id,
			followerId: follower.id,
			followeeHost: null,
			followerHost: null,
			notify: 'normal',
		});
		const analytics = Promise.withResolvers<void>();
		const started = Promise.withResolvers<void>();
		const update = vi.spyOn(runtime.chartWriters.notesChart, 'update').mockImplementation(async () => {
			started.resolve();
			await analytics.promise;
		});
		const errors: unknown[] = [];
		const notePostProcessing = createNotePostProcessing((error) => errors.push(error), 2);
		let noteId: string | undefined;
		try {
			const response = await runInRequestScope(() =>
				handleApiNotesCreate({ ...runtime, notePostProcessing }, user, {
					text: 'operation scoped notification',
					localOnly: true,
					visibility: 'public',
				}),
			);
			noteId = z.object({ id: z.string() }).parse(response.createdNote).id;
			await started.promise;
			await runtime.db.delete(following).where(eq(following.id, followingId));
			analytics.resolve();
			await notePostProcessing.close();
			expect(await runtime.redis.xlen(`notificationTimeline:${follower.id}`)).toBe(0);
			expect(errors).toEqual([]);
		} finally {
			analytics.resolve();
			await notePostProcessing.close();
			update.mockRestore();
			if (noteId != null) await deleteNotesByIdsFromDatabase(runtime.db, [noteId]);
			await runtime.redis.del(`notificationTimeline:${follower.id}`);
			await runtime.redisForTimelines.del(`list:userTimeline:${user.id}`, `list:homeTimeline:${follower.id}`);
			await deleteUserByIdFromDatabase(runtime.db, follower.id);
			await deleteUserByIdFromDatabase(runtime.db, user.id);
		}
	});

	test('a committed creation still attempts analytics once when its required effect fails', async () => {
		const user = await createLocalUser('failedrequired');
		const failure = new Error('required fanout failed');
		const fanout = vi.spyOn(FanoutTimelinePush.prototype, 'flush').mockRejectedValueOnce(failure);
		const analytics = vi.spyOn(runtime.chartWriters.notesChart, 'update');
		const notePostProcessing = createNotePostProcessing(() => {}, 2);
		const jobData = z.object({ noteId: z.string() });
		try {
			await expect(
				handleApiNotesCreate({ ...runtime, notePostProcessing }, user, {
					text: 'committed creation',
					visibility: 'home',
					localOnly: true,
				}),
			).rejects.toBe(failure);
			await notePostProcessing.close();
			expect((await fetchUserByIdOrFailFromDatabase(runtime.db, user.id)).notesCount).toBe(1);
			expect(analytics).toHaveBeenCalledTimes(1);
		} finally {
			await notePostProcessing.close();
			fanout.mockRestore();
			analytics.mockRestore();
			const notes = await runtime.db.select({ id: noteTable.id }).from(noteTable).where(eq(noteTable.userId, user.id));
			const ids = notes.map((note) => note.id);
			const rows = await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.name, 'notePostCreate'));
			const outboxIds = rows.filter((row) => ids.includes(jobData.parse(row.data).noteId)).map((row) => row.id);
			if (outboxIds.length > 0) await runtime.db.delete(queueOutbox).where(inArray(queueOutbox.id, outboxIds));
			if (ids.length > 0) await deleteNotesByIdsFromDatabase(runtime.db, ids);
			await deleteUserByIdFromDatabase(runtime.db, user.id);
		}
	});

	test('a deterministic notification can be retried without adding a second stream entry', async () => {
		const user = await createLocalUser('durablenotification');
		const notification = {
			id: genId(),
			createdAt: new Date().toISOString(),
			type: 'note',
			notifierId: user.id,
			noteId: genId(),
		};
		const key = `notificationTimeline:${user.id}`;

		try {
			await xaddApiNotification(runtime, user.id, notification);
			await expect(xaddApiNotification(runtime, user.id, notification)).resolves.toBe(toXListId(notification.id));
			expect(await runtime.redis.xlen(key)).toBe(1);
		} finally {
			await runtime.redis.del(key);
			await deleteUserByIdFromDatabase(runtime.db, user.id);
		}
	});

	test('a delayed notification is appended after newer stream entries and remains idempotent', async () => {
		const user = await createLocalUser('durabledelayednotification');
		const older = {
			id: genId(Date.now() - 60_000),
			createdAt: new Date(Date.now() - 60_000).toISOString(),
			type: 'note',
			notifierId: user.id,
			noteId: genId(Date.now() - 60_000),
		};
		const newer = { ...older, id: genId(), createdAt: new Date().toISOString(), noteId: genId() };
		const key = `notificationTimeline:${user.id}`;

		try {
			await xaddApiNotification(runtime, user.id, newer);
			const appendedId = await xaddApiNotification(runtime, user.id, older);
			await expect(xaddApiNotification(runtime, user.id, older)).resolves.toBe(appendedId);
			await expect(resolveNotificationStreamId(runtime, user.id, older.id)).resolves.toBe(appendedId);
			expect(await runtime.redis.xlen(key)).toBe(2);
		} finally {
			await runtime.redis.del(key);
			await deleteUserByIdFromDatabase(runtime.db, user.id);
		}
	});
});
