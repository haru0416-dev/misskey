/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createBunSqlDatabase, createBunSqlClient } from '@/db/bun-sql.js';
import type { SQL as NativeSqlClient } from 'bun';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { createUserInDatabase } from '@/core/user/UserStore.js';
import { createNoteInDatabase, fetchNoteByIdFromDatabase } from '@/core/note/NoteStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { handleQueueCleanRemoteNotes } from '@/queue/handlers/clean-remote-notes.js';
import type { QueueCleanRemoteNotesDependencies } from '@/queue/handlers/clean-remote-notes.js';
import type { Config } from '@/config.js';
import type { QueueMaintenanceReporter } from '@/queue/types.js';

function createReporter(): QueueMaintenanceReporter {
	return {
		log: async () => 0,
		updateProgress: async () => {},
	};
}

describe('hono-queue-clean-remote-notes', () => {
	let pool: NativeSqlClient;
	let db: MiDrizzleDatabase;
	let config: Config;
	let deps: QueueCleanRemoteNotesDependencies;

	beforeAll(() => {
		config = loadConfig();
		pool = createBunSqlClient(config);
		db = createBunSqlDatabase(pool, config);
		deps = {
			db,
			meta: {
				enableRemoteNotesCleaning: false,
				remoteNotesCleaningMaxProcessingDurationInMinutes: 60,
				remoteNotesCleaningExpiryDaysForEachNotes: 90,
			},
		};
	});

	afterAll(async () => {
		await pool.close();
	});

	test('enableRemoteNotesCleaningがfalseの場合はskippedを返す', async () => {
		const result = await handleQueueCleanRemoteNotes(deps, createReporter());
		expect(result).toEqual({ deletedCount: 0, oldest: null, newest: null, skipped: true, transientErrors: 0 });
	});

	test('返信・リアクション・お気に入り・ピン留めが無い古いリモートノートを削除する', async () => {
		const host = `honoqueuecrn-${genId()}.example.com`;
		const userId = genId();
		await createUserInDatabase(db, {
			id: userId,
			username: `honoqueuecrn${userId}`,
			usernameLower: `honoqueuecrn${userId}`.toLowerCase(),
			host,
		});

		const noteId = genId(Date.now() - 1000 * 60 * 60 * 24 * 100);
		await createNoteInDatabase(db, {
			id: noteId,
			text: 'hono-queue-clean-remote-notes test',
			userId,
			userHost: host,
			visibility: 'public',
		});

		// テストDBには他テストが残した古いリモートノートが蓄積している可能性があるため、
		// 処理時間の上限を短く抑えてテストの実行時間を有界にする
		// (NODE_ENV=testではバッチ間のsetTimeoutはスキップされるが、CTEクエリ自体の
		// 累積コストは残るため、maxDurationによる打ち切りを安全弁として使う)。
		const result = await handleQueueCleanRemoteNotes(
			{
				...deps,
				meta: { ...deps.meta, enableRemoteNotesCleaning: true, remoteNotesCleaningMaxProcessingDurationInMinutes: 0.1 },
			},
			createReporter(),
		);

		expect(result.skipped).toBe(false);
		expect(result.deletedCount).toBeGreaterThanOrEqual(1);

		const noteAfter = await fetchNoteByIdFromDatabase(db, noteId);
		expect(noteAfter).toBeNull();
	});
});
