/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { inArray } from 'drizzle-orm';
import { loadConfig } from '@/config.js';
import { deleteAccountWithSideEffects, type DeleteAccountDependencies } from '@/core/DeleteAccountLogic.js';
import { listModerationLogsFromDatabase } from '@/core/ModerationLogStore.js';
import type { DbQueue, DeliverQueue } from '@/core/queues.js';
import {
	createUserWithProfileAndPublickeyInDatabase,
	deleteUserByIdFromDatabase,
	fetchUserByIdOrFailFromDatabase,
} from '@/core/UserStore.js';
import { following } from '@/db/schema/following.js';
import { queueOutbox, type QueueOutboxRow } from '@/db/schema/queue-outbox.js';
import { genId } from '@/misc/id/gen-id.js';
import { QUEUE } from '@/queue/const.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';

function isDeleteAccountOutboxForUser(row: QueueOutboxRow, userId: string): boolean {
	const data = row.data as { user?: { id?: unknown } };
	return row.name === 'deleteAccount' && data.user?.id === userId;
}

function isDeliverOutboxForUser(row: QueueOutboxRow, userId: string): boolean {
	const envelope = row.data as { data?: { user?: { id?: unknown } } };
	return row.queue === QUEUE.DELIVER && row.name === 'deliver' && envelope.data?.user?.id === userId;
}

describe('DeleteAccountLogic', () => {
	let runtime: RuntimeDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	async function createRemoteUser(prefix: string) {
		const id = genId();
		return await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: {
				id,
				username: `${prefix}${id}`,
				usernameLower: `${prefix}${id}`.toLowerCase(),
				host: 'remote.example.com',
			},
			profile: { userId: id },
		});
	}

	async function createLocalUser(prefix: string) {
		const id = genId();
		return await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: {
				id,
				username: `${prefix}${id}`,
				usernameLower: `${prefix}${id}`.toLowerCase(),
			},
			profile: { userId: id },
		});
	}

	function createDependencies(
		addBulk: ReturnType<typeof vi.fn>,
		publishInternalEvent = vi.fn(),
		deliverAdd = vi.fn().mockResolvedValue(undefined),
	): DeleteAccountDependencies {
		return {
			config: runtime.config,
			meta: { rootUserId: null },
			db: runtime.db,
			dbQueue: { addBulk } as unknown as DbQueue,
			deliverQueue: { add: deliverAdd } as unknown as DeliverQueue,
			publishInternalEvent,
		};
	}

	test('moderation log failure rolls back deleted state and outbox', async () => {
		const target = await createRemoteUser('deleteaccountrollback');
		const addBulk = vi.fn().mockResolvedValue([]);
		const publishInternalEvent = vi.fn();
		const missingModerator = { id: genId() };

		try {
			await expect(
				deleteAccountWithSideEffects(createDependencies(addBulk, publishInternalEvent), target, missingModerator),
			).rejects.toThrow();

			expect((await fetchUserByIdOrFailFromDatabase(runtime.db, target.id)).isDeleted).toBe(false);
			const outboxRows = await runtime.db.select().from(queueOutbox);
			expect(outboxRows.some((row) => isDeleteAccountOutboxForUser(row, target.id))).toBe(false);
			expect(addBulk).not.toHaveBeenCalled();
			expect(publishInternalEvent).not.toHaveBeenCalled();
		} finally {
			await deleteUserByIdFromDatabase(runtime.db, target.id);
		}
	});

	test('local account deletion commits ActivityPub deliveries to the outbox', async () => {
		const target = await createLocalUser('deleteaccountlocal');
		const remote = await createRemoteUser('deleteaccountremote');
		const dbAddBulk = vi.fn().mockResolvedValue([]);
		const deliverAdd = vi.fn().mockResolvedValue(undefined);
		const sharedInbox = 'https://remote.example.com/inbox';
		await runtime.db.insert(following).values({
			id: genId(),
			followerId: remote.id,
			followeeId: target.id,
			followerHost: remote.host,
			followerInbox: `https://${remote.host}/users/${remote.id}/inbox`,
			followerSharedInbox: sharedInbox,
		});

		try {
			await deleteAccountWithSideEffects(createDependencies(dbAddBulk, vi.fn(), deliverAdd), target);

			const outboxRows = (await runtime.db.select().from(queueOutbox)).filter((row) =>
				isDeliverOutboxForUser(row, target.id),
			);
			expect(outboxRows).toHaveLength(1);
			const coordinatorRows = (await runtime.db.select().from(queueOutbox)).filter((row) =>
				isDeleteAccountOutboxForUser(row, target.id),
			);
			expect(coordinatorRows).toHaveLength(1);
			expect(coordinatorRows[0]?.queue).toBe(QUEUE.DB);
			expect(coordinatorRows[0]?.kind).toBe('accountDeleteCoordinator');
			expect(outboxRows[0]?.coordinatorId).toBe(coordinatorRows[0]?.id);
			expect(outboxRows[0]?.data).toMatchObject({
				data: {
					user: { id: target.id },
					to: sharedInbox,
					isSharedInbox: true,
				},
			});
			expect(deliverAdd).not.toHaveBeenCalled();
			// 配送待ちがあるコーディネータ行はディスパッチャの担当なので、ここで発行してはいけない
			expect(dbAddBulk).not.toHaveBeenCalled();
		} finally {
			const outboxIds = (await runtime.db.select().from(queueOutbox))
				.filter((row) => isDeleteAccountOutboxForUser(row, target.id) || isDeliverOutboxForUser(row, target.id))
				.map((row) => row.id);
			if (outboxIds.length > 0) await runtime.db.delete(queueOutbox).where(inArray(queueOutbox.id, outboxIds));
			await deleteUserByIdFromDatabase(runtime.db, target.id);
			await deleteUserByIdFromDatabase(runtime.db, remote.id);
		}
	});

	test('admin deletion commits moderation log, outbox, and deleted state together', async () => {
		const moderator = await createLocalUser('deleteaccountmoderator');
		const target = await createRemoteUser('deleteaccountsuccess');
		const addBulk = vi.fn().mockResolvedValue([]);
		const publishInternalEvent = vi.fn();

		try {
			await deleteAccountWithSideEffects(createDependencies(addBulk, publishInternalEvent), target, moderator);

			expect((await fetchUserByIdOrFailFromDatabase(runtime.db, target.id)).isDeleted).toBe(true);

			// 配送待ちが無い削除は即時発行されるので、行の内容ではなく発行内容を検証する
			await vi.waitFor(() => expect(addBulk).toHaveBeenCalledTimes(1));
			const publishedJobs = addBulk.mock.calls[0]?.[0] as { name: string; data: unknown; opts: { jobId: string } }[];
			expect(publishedJobs).toHaveLength(1);
			expect(publishedJobs[0]?.name).toBe('deleteAccount');
			expect(publishedJobs[0]?.data).toEqual({ user: { id: target.id }, soft: true });
			expect(publishedJobs[0]?.opts.jobId).toMatch(/^outbox-/);

			// 発行済みの行を残すとジョブ完了後にディスパッチャが同じ jobId を作り直し、削除が二重実行される
			await vi.waitFor(async () => {
				const remaining = (await runtime.db.select().from(queueOutbox)).filter((row) =>
					isDeleteAccountOutboxForUser(row, target.id),
				);
				expect(remaining).toHaveLength(0);
			});

			const logs = await listModerationLogsFromDatabase(runtime.db, {
				limit: 10,
				order: 'desc',
				type: 'deleteAccount',
				userId: moderator.id,
			});
			expect(logs).toHaveLength(1);
			expect(logs[0]?.info).toEqual({
				userId: target.id,
				userUsername: target.username,
				userHost: target.host,
			});
			expect(publishInternalEvent).toHaveBeenCalledWith('userChangeDeletedState', { id: target.id, isDeleted: true });
		} finally {
			const outboxIds = (await runtime.db.select().from(queueOutbox))
				.filter((row) => isDeleteAccountOutboxForUser(row, target.id))
				.map((row) => row.id);
			if (outboxIds.length > 0) await runtime.db.delete(queueOutbox).where(inArray(queueOutbox.id, outboxIds));
			await deleteUserByIdFromDatabase(runtime.db, target.id);
			await deleteUserByIdFromDatabase(runtime.db, moderator.id);
		}
	});
});
