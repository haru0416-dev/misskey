/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// createRuntimeDependencies() が構築する UrlPreviewService は rolldown の `define` で注入される
// _SUMMALY_VERSION_ を参照するが、vitest はソースを直接importするだけでrolldownを経由しないため
// 未定義になる。テスト用にダミー値を注入しておく。
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type * as Bull from 'bullmq';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/user/UserStore.js';
import { createNoteInDatabase } from '@/core/note/NoteStore.js';
import { listDriveFilesByUserIdWithPaginationFromDatabase } from '@/core/drive/DriveFileStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { handleQueueExportNotes, type QueueDbDependencies } from '@/queue/handlers/db.js';
import type { DbJobDataWithUser } from '@/queue/types.js';

function fakeJob(data: DbJobDataWithUser): Bull.Job<DbJobDataWithUser> {
	return { data, updateProgress: async () => {} } as unknown as Bull.Job<DbJobDataWithUser>;
}

describe('hono-queue-db (exportNotes)', () => {
	let runtime: RuntimeDependencies;
	let deps: QueueDbDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = { ...runtime, logger: runtime.loggerService.getLogger('test-export-notes') };
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('投稿したノート一覧をJSONとしてドライブに保存する', async () => {
		const id = genId();
		const user = await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: { id, username: `honoqueueexpnote${id}`, usernameLower: `honoqueueexpnote${id}`.toLowerCase() },
			profile: { userId: id },
		});

		await createNoteInDatabase(runtime.db, {
			id: genId(),
			text: 'hono-queue-export-notes test',
			userId: user.id,
			userHost: null,
			visibility: 'public',
		});

		await handleQueueExportNotes(deps, fakeJob({ user: { id: user.id } }));

		const files = await listDriveFilesByUserIdWithPaginationFromDatabase(runtime.db, user.id, { limit: 10 });
		expect(files.some((f) => f.name.startsWith('notes-') && f.name.endsWith('.json'))).toBe(true);
	});

	test('存在しないuserIdは何もしない', async () => {
		await expect(handleQueueExportNotes(deps, fakeJob({ user: { id: genId() } }))).resolves.toBeUndefined();
	});
});
