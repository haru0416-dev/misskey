/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// createRuntimeDependencies() が構築する UrlPreviewService は rolldown の `define` で注入される
// _SUMMALY_VERSION_ を参照するが、vitest はソースを直接importするだけでrolldownを経由しないため
// 未定義になる。テスト用にダミー値を注入しておく。
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import * as Bull from 'bullmq';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserInDatabase } from '@/core/user/UserStore.js';
import { createNoteDraftInDatabase, fetchNoteDraftByIdFromDatabase } from '@/core/note/NoteDraftStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { handleQueuePostScheduledNote } from '@/queue/handlers/post-scheduled-note.js';
import type { PostScheduledNoteJobData } from '@/queue/types.js';

function fakeJob(data: PostScheduledNoteJobData): Bull.Job<PostScheduledNoteJobData> {
	return { data } as Bull.Job<PostScheduledNoteJobData>;
}

describe('hono-queue-post-scheduled-note', () => {
	let runtime: RuntimeDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('scheduledAt/isActuallyScheduledな下書きからノートを作成し、下書きを削除する', async () => {
		const userId = genId();
		await createUserInDatabase(runtime.db, {
			id: userId,
			username: `honoqueuepsn${userId}`,
			usernameLower: `honoqueuepsn${userId}`.toLowerCase(),
		});

		const draftId = genId();
		await createNoteDraftInDatabase(runtime.db, {
			id: draftId,
			userId,
			text: 'scheduled note from hono queue test',
			visibility: 'public',
			pollMultiple: false,
			scheduledAt: new Date(Date.now() - 1000),
			isActuallyScheduled: true,
		});

		await handleQueuePostScheduledNote(
			runtime,
			fakeJob({
				noteDraftId: draftId,
				scheduledAt: (await fetchNoteDraftByIdFromDatabase(runtime.db, draftId))!.scheduledAt!.getTime(),
			}),
		);

		const draftAfter = await fetchNoteDraftByIdFromDatabase(runtime.db, draftId);
		expect(draftAfter).toBeNull();
	});

	test('isActuallyScheduledがfalseの下書きは何もしない', async () => {
		const userId = genId();
		await createUserInDatabase(runtime.db, {
			id: userId,
			username: `honoqueuepsn${userId}`,
			usernameLower: `honoqueuepsn${userId}`.toLowerCase(),
		});

		const draftId = genId();
		await createNoteDraftInDatabase(runtime.db, {
			id: draftId,
			userId,
			text: 'not actually scheduled',
			visibility: 'public',
			pollMultiple: false,
			isActuallyScheduled: false,
		});

		await handleQueuePostScheduledNote(runtime, fakeJob({ noteDraftId: draftId, scheduledAt: 0 }));

		const draftAfter = await fetchNoteDraftByIdFromDatabase(runtime.db, draftId);
		expect(draftAfter).not.toBeNull();
	});

	test('存在しないnoteDraftIdは何もしない', async () => {
		await expect(
			handleQueuePostScheduledNote(runtime, fakeJob({ noteDraftId: genId(), scheduledAt: Date.now() })),
		).resolves.toBeUndefined();
	});
});
