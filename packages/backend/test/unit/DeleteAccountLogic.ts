/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env['NODE_ENV'] = 'test';
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { inArray } from 'drizzle-orm';
import { loadConfig } from '@/config.js';
import { deleteAccountWithSideEffects, type DeleteAccountDependencies } from '@/core/DeleteAccountLogic.js';
import { listModerationLogsFromDatabase } from '@/core/ModerationLogStore.js';
import type { DbQueue, DeliverQueue } from '@/core/queues.js';
import { createUserWithProfileAndPublickeyInDatabase, deleteUserByIdFromDatabase, fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import { queueOutbox, type QueueOutboxRow } from '@/db/schema/queue-outbox.js';
import { genId } from '@/misc/id/gen-id.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';

function isDeleteAccountOutboxForUser(row: QueueOutboxRow, userId: string): boolean {
	const data = row.data as { user?: { id?: unknown } };
	return row.name === 'deleteAccount' && data.user?.id === userId;
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

	function createDependencies(add: ReturnType<typeof vi.fn>, publishInternalEvent = vi.fn()): DeleteAccountDependencies {
		return {
			config: runtime.config,
			meta: { rootUserId: null },
			db: runtime.db,
			dbQueue: { add } as unknown as DbQueue,
			deliverQueue: {} as DeliverQueue,
			publishInternalEvent,
		};
	}

	test('moderation log failure rolls back deleted state and outbox', async () => {
		const target = await createRemoteUser('deleteaccountrollback');
		const add = vi.fn().mockResolvedValue(undefined);
		const publishInternalEvent = vi.fn();
		const missingModerator = { id: genId() };

		try {
			await expect(deleteAccountWithSideEffects(
				createDependencies(add, publishInternalEvent),
				target,
				missingModerator,
			)).rejects.toThrow();

			expect((await fetchUserByIdOrFailFromDatabase(runtime.db, target.id)).isDeleted).toBe(false);
			const outboxRows = await runtime.db.select().from(queueOutbox);
			expect(outboxRows.some(row => isDeleteAccountOutboxForUser(row, target.id))).toBe(false);
			expect(add).not.toHaveBeenCalled();
			expect(publishInternalEvent).not.toHaveBeenCalled();
		} finally {
			await deleteUserByIdFromDatabase(runtime.db, target.id);
		}
	});

	test('admin deletion commits moderation log, outbox, and deleted state together', async () => {
		const moderator = await createLocalUser('deleteaccountmoderator');
		const target = await createRemoteUser('deleteaccountsuccess');
		const add = vi.fn().mockResolvedValue(undefined);
		const publishInternalEvent = vi.fn();

		try {
			await deleteAccountWithSideEffects(createDependencies(add, publishInternalEvent), target, moderator);

			expect((await fetchUserByIdOrFailFromDatabase(runtime.db, target.id)).isDeleted).toBe(true);
			const outboxRows = (await runtime.db.select().from(queueOutbox))
				.filter(row => isDeleteAccountOutboxForUser(row, target.id));
			expect(outboxRows).toHaveLength(1);
			expect(outboxRows[0]?.data).toEqual({ user: { id: target.id }, soft: true });

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
			expect(add).toHaveBeenCalledWith('deleteAccount', {
				user: { id: target.id },
				soft: true,
			}, expect.objectContaining({ jobId: `outbox-${outboxRows[0]?.id}` }));
			expect(publishInternalEvent).toHaveBeenCalledWith('userChangeDeletedState', { id: target.id, isDeleted: true });
		} finally {
			const outboxIds = (await runtime.db.select().from(queueOutbox))
				.filter(row => isDeleteAccountOutboxForUser(row, target.id))
				.map(row => row.id);
			if (outboxIds.length > 0) await runtime.db.delete(queueOutbox).where(inArray(queueOutbox.id, outboxIds));
			await deleteUserByIdFromDatabase(runtime.db, target.id);
			await deleteUserByIdFromDatabase(runtime.db, moderator.id);
		}
	});
});
