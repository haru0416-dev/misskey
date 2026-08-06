/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env['NODE_ENV'] = 'test';
// createRuntimeDependencies() が構築する UrlPreviewService は rolldown の `define` で注入される
// _SUMMALY_VERSION_ を参照するが、vitest はソースを直接importするだけでrolldownを経由しないため
// 未定義になる。テスト用にダミー値を注入しておく。
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type * as Bull from 'bullmq';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/UserStore.js';
import { createNoteInDatabase } from '@/core/NoteStore.js';
import { createClipInDatabase } from '@/core/ClipStore.js';
import { createClipNoteInDatabase } from '@/core/ClipNoteStore.js';
import { listDriveFilesByUserIdWithPaginationFromDatabase } from '@/core/DriveFileStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { handleHonoQueueExportClips, type HonoQueueDbDependencies } from '@/queue/handlers/db.js';
import type { DbJobDataWithUser } from '@/queue/types.js';

function fakeJob(data: DbJobDataWithUser): Bull.Job<DbJobDataWithUser> {
	return { data, updateProgress: async () => {} } as unknown as Bull.Job<DbJobDataWithUser>;
}

describe('hono-queue-db (exportClips)', () => {
	let runtime: RuntimeDependencies;
	let deps: HonoQueueDbDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = { ...runtime, logger: runtime.loggerService.getLogger('test-export-clips') };
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('クリップとクリップ内のノートをJSONとしてドライブに保存する', async () => {
		const id = genId();
		const user = await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: { id, username: `honoqueueexpclip${id}`, usernameLower: `honoqueueexpclip${id}`.toLowerCase() },
			profile: { userId: id },
		});

		const noteId = genId();
		await createNoteInDatabase(runtime.db, {
			id: noteId,
			text: 'hono-queue-export-clips test',
			userId: user.id,
			userHost: null,
			visibility: 'public',
		});

		const clip = await createClipInDatabase(runtime.db, {
			id: genId(),
			userId: user.id,
			name: 'test-clip',
		});
		await createClipNoteInDatabase(runtime.db, { id: genId(), clipId: clip.id, noteId });

		await handleHonoQueueExportClips(deps, fakeJob({ user: { id: user.id } }));

		const files = await listDriveFilesByUserIdWithPaginationFromDatabase(runtime.db, user.id, { limit: 10 });
		expect(files.some((f) => f.name.startsWith('clips-') && f.name.endsWith('.json'))).toBe(true);
	});

	test('存在しないuserIdは何もしない', async () => {
		await expect(handleHonoQueueExportClips(deps, fakeJob({ user: { id: genId() } }))).resolves.toBeUndefined();
	});
});
