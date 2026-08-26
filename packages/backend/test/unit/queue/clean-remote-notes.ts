/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type * as Bull from 'bullmq';
import { loadConfig } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool, type MiDrizzleDatabase, type MiDrizzlePool } from '@/drizzle.js';
import { createUserInDatabase } from '@/core/user/UserStore.js';
import { createNoteInDatabase, fetchNoteByIdFromDatabase } from '@/core/note/NoteStore.js';
import { genId } from '@/misc/id/gen-id.js';
import {
	handleHonoQueueCleanRemoteNotes,
	type HonoQueueCleanRemoteNotesDependencies,
} from '@/queue/handlers/clean-remote-notes.js';
import type { Config } from '@/config.js';

function fakeJob(): Bull.Job<Record<string, unknown>> {
	return {
		log: async () => 0,
		updateProgress: async () => {},
	} as unknown as Bull.Job<Record<string, unknown>>;
}

describe('hono-queue-clean-remote-notes', () => {
	let pool: MiDrizzlePool;
	let db: MiDrizzleDatabase;
	let config: Config;
	let deps: HonoQueueCleanRemoteNotesDependencies;

	beforeAll(() => {
		config = loadConfig();
		pool = createDrizzlePool(config);
		db = createDrizzleDatabase(pool, config);
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
		await pool.end();
	});

	test('enableRemoteNotesCleaningがfalseの場合はskippedを返す', async () => {
		const result = await handleHonoQueueCleanRemoteNotes(deps, fakeJob());
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
		const result = await handleHonoQueueCleanRemoteNotes(
			{
				...deps,
				meta: { ...deps.meta, enableRemoteNotesCleaning: true, remoteNotesCleaningMaxProcessingDurationInMinutes: 0.1 },
			},
			fakeJob(),
		);

		expect(result.skipped).toBe(false);
		expect(result.deletedCount).toBeGreaterThanOrEqual(1);

		const noteAfter = await fetchNoteByIdFromDatabase(db, noteId);
		expect(noteAfter).toBeNull();
	});
});
