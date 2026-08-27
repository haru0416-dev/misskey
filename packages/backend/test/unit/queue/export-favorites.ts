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
import { createNoteFavoriteInDatabase } from '@/core/note/NoteFavoriteStore.js';
import { listDriveFilesByUserIdWithPaginationFromDatabase } from '@/core/drive/DriveFileStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { handleQueueExportFavorites, type QueueDbDependencies } from '@/queue/handlers/db.js';
import type { DbJobDataWithUser } from '@/queue/types.js';

function fakeJob(data: DbJobDataWithUser): Bull.Job<DbJobDataWithUser> {
	return { data, updateProgress: async () => {} } as unknown as Bull.Job<DbJobDataWithUser>;
}

describe('hono-queue-db (exportFavorites)', () => {
	let runtime: RuntimeDependencies;
	let deps: QueueDbDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = { ...runtime, logger: runtime.loggerService.getLogger('test-export-favorites') };
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('お気に入りに登録したノート一覧をJSONとしてドライブに保存する', async () => {
		const id = genId();
		const user = await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: { id, username: `honoqueueexpfav${id}`, usernameLower: `honoqueueexpfav${id}`.toLowerCase() },
			profile: { userId: id },
		});

		const noteId = genId();
		await createNoteInDatabase(runtime.db, {
			id: noteId,
			text: 'hono-queue-export-favorites test',
			userId: user.id,
			userHost: null,
			visibility: 'public',
		});
		await createNoteFavoriteInDatabase(runtime.db, { id: genId(), userId: user.id, noteId });

		await handleQueueExportFavorites(deps, fakeJob({ user: { id: user.id } }));

		const files = await listDriveFilesByUserIdWithPaginationFromDatabase(runtime.db, user.id, { limit: 10 });
		expect(files.some((f) => f.name.startsWith('favorites-') && f.name.endsWith('.json'))).toBe(true);
	});

	test('存在しないuserIdは何もしない', async () => {
		await expect(handleQueueExportFavorites(deps, fakeJob({ user: { id: genId() } }))).resolves.toBeUndefined();
	});
});
