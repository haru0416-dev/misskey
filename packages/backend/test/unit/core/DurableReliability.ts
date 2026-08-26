/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type * as Bull from 'bullmq';
import { eq, inArray } from 'drizzle-orm';
import { loadConfig } from '@/config.js';
import { deleteNotesByIdsFromDatabase } from '@/core/note/NoteStore.js';
import { createFollowingInDatabase } from '@/core/user/FollowingStore.js';
import { listModerationLogsFromDatabase } from '@/core/moderation/ModerationLogStore.js';
import {
	createUserWithProfileAndPublickeyInDatabase,
	deleteUserByIdFromDatabase,
	fetchUserByIdOrFailFromDatabase,
	updateUserInDatabase,
} from '@/core/user/UserStore.js';
import { queueOutbox } from '@/db/schema/queue-outbox.js';
import { genId } from '@/misc/id/gen-id.js';
import type { DbQueue } from '@/core/queue/queues.js';
import type { DbUserSuspensionPostEffectsJobData } from '@/queue/types.js';
import type { MiLocalUser } from '@/models/User.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import {
	handleHonoApiAdminSuspendUser,
	handleHonoApiAdminUnsuspendUser,
	handleHonoQueueUserSuspensionPostEffects,
	type HonoApiAdminUserSuspensionDependencies,
} from '@/server/rest/admin/admin-user-suspension.js';
import { createNoteForHonoApi, type HonoApiNotesCreateDependencies } from '@/server/rest/note/notes-create.js';
import { handleHonoQueueDeliver } from '@/queue/handlers/deliver.js';
import { handleHonoQueueRelationshipUnfollow } from '@/queue/handlers/relationship.js';
import type { DeliverJobData, RelationshipJobData } from '@/queue/types.js';
import { resolveNotificationStreamId, toXListId, xaddHonoApiNotification } from '@/server/rest/notification/notification.js';

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
		} as unknown as HonoApiAdminUserSuspensionDependencies;

		try {
			await handleHonoApiAdminSuspendUser(deps, moderator, { userId: target.id });
			expect((await fetchUserByIdOrFailFromDatabase(runtime.db, target.id)).isSuspended).toBe(true);
			const [suspendOutbox] = await runtime.db
				.select()
				.from(queueOutbox)
				.where(eq(queueOutbox.name, 'userSuspensionPostEffects'));
			expect(suspendOutbox).toBeDefined();

			await handleHonoApiAdminUnsuspendUser(deps, moderator, { userId: target.id });
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
			await handleHonoQueueUserSuspensionPostEffects(deps, {
				data: {
					userId: target.id,
					isSuspended: false,
					transitionedAt: new Date().toISOString(),
					transitionId: unsuspendLog!.id,
				},
			} as Bull.Job<DbUserSuspensionPostEffectsJobData>);
			expect(publishInternalEvent).toHaveBeenCalledWith('userChangeSuspendedState', {
				id: target.id,
				isSuspended: false,
			});
			publishInternalEvent.mockClear();

			await handleHonoQueueUserSuspensionPostEffects(deps, {
				data: suspendOutbox!.data as DbUserSuspensionPostEffectsJobData,
			} as Bull.Job<DbUserSuspensionPostEffectsJobData>);
			expect(publishInternalEvent).not.toHaveBeenCalled();

			const guard = suspendOutbox!.data as DbUserSuspensionPostEffectsJobData;
			await expect(
				handleHonoQueueDeliver(
					deps as unknown as Parameters<typeof handleHonoQueueDeliver>[0],
					{
						data: {
							user: { id: target.id },
							content: '{}',
							digest: 'test',
							to: 'https://remote.example.test/inbox',
							isSharedInbox: true,
							userStateGuard: guard,
						},
					} as Bull.Job<DeliverJobData>,
				),
			).resolves.toBe('skip (stale user state)');
			await expect(
				handleHonoQueueRelationshipUnfollow(
					deps as unknown as Parameters<typeof handleHonoQueueRelationshipUnfollow>[0],
					{
						data: {
							from: { id: target.id },
							to: { id: moderator.id },
							userStateGuard: guard,
						},
					} as Bull.Job<RelationshipJobData>,
				),
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
		} as unknown as HonoApiNotesCreateDependencies;
		let noteId: string | undefined;

		try {
			const note = await createNoteForHonoApi(
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
			if (ids.length > 0) await runtime.db.delete(queueOutbox).where(inArray(queueOutbox.id, ids));
			if (noteId != null) await deleteNotesByIdsFromDatabase(runtime.db, [noteId]);
			if (noteId != null) await runtime.redisForTimelines.lrem(`list:userTimeline:${user.id}`, 0, noteId);
			await runtime.redis.del(`notificationTimeline:${follower.id}`);
			await deleteUserByIdFromDatabase(runtime.db, follower.id);
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
			await xaddHonoApiNotification(runtime, user.id, notification);
			await expect(xaddHonoApiNotification(runtime, user.id, notification)).resolves.toBe(toXListId(notification.id));
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
			await xaddHonoApiNotification(runtime, user.id, newer);
			const appendedId = await xaddHonoApiNotification(runtime, user.id, older);
			await expect(xaddHonoApiNotification(runtime, user.id, older)).resolves.toBe(appendedId);
			await expect(resolveNotificationStreamId(runtime, user.id, older.id)).resolves.toBe(appendedId);
			expect(await runtime.redis.xlen(key)).toBe(2);
		} finally {
			await runtime.redis.del(key);
			await deleteUserByIdFromDatabase(runtime.db, user.id);
		}
	});
});
