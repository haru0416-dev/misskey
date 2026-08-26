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
import { createUserWithProfileAndPublickeyInDatabase, deleteUserByIdFromDatabase } from '@/core/user/UserStore.js';
import { createNoteInDatabase, fetchNoteByIdFromDatabase } from '@/core/note/NoteStore.js';
import { createDriveFileInDatabase, fetchDriveFileByIdFromDatabase } from '@/core/drive/DriveFileStore.js';
import { createPageInDatabase, fetchPageByIdFromDatabase } from '@/core/page/PageStore.js';
import { fetchUserByIdFromDatabase } from '@/core/user/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import {
	handleHonoQueueDeleteAccount,
	type HonoQueueDeleteAccountDependencies,
} from '@/queue/handlers/delete-account.js';
import type { DbUserDeleteJobData } from '@/queue/types.js';

function fakeJob(data: DbUserDeleteJobData, id?: string): Bull.Job<DbUserDeleteJobData> {
	return { data, id, updateProgress: async () => {} } as unknown as Bull.Job<DbUserDeleteJobData>;
}

describe('hono-queue-delete-account', () => {
	let runtime: RuntimeDependencies;
	let deps: HonoQueueDeleteAccountDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = runtime;
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('ノート・ドライブファイル・ページ・ユーザー行を削除する (soft指定なし)', async () => {
		const id = genId();
		const user = await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: { id, username: `honoqueuedelacct${id}`, usernameLower: `honoqueuedelacct${id}`.toLowerCase() },
			profile: { userId: id },
		});

		const noteId = genId();
		await createNoteInDatabase(runtime.db, {
			id: noteId,
			text: 'hono-queue-delete-account test',
			userId: user.id,
			userHost: null,
			visibility: 'public',
		});

		const fileId = genId();
		await createDriveFileInDatabase(runtime.db, {
			id: fileId,
			md5: 'dummy',
			name: 'test.png',
			type: 'image/png',
			size: 100,
			storedInternal: true,
			url: 'http://example.com/test.png',
			accessKey: `access-${fileId}`,
			userId: user.id,
			userHost: null,
		});

		const pageId = genId();
		await createPageInDatabase(runtime.db, {
			id: pageId,
			updatedAt: new Date(),
			title: 'test page',
			name: `test-page-${pageId}`,
			alignCenter: false,
			font: 'sans-serif',
			userId: user.id,
			visibility: 'public',
		});

		await handleHonoQueueDeleteAccount(
			deps,
			fakeJob({ user: { id: user.id }, soft: false, accountDeleteCoordinatorId: genId() }),
		);

		expect(await fetchNoteByIdFromDatabase(runtime.db, noteId)).toBeNull();
		expect(await fetchDriveFileByIdFromDatabase(runtime.db, fileId)).toBeNull();
		expect(await fetchPageByIdFromDatabase(runtime.db, pageId)).toBeNull();
		expect(await fetchUserByIdFromDatabase(runtime.db, user.id)).toBeNull();
	});

	test('soft指定時はユーザー行を物理削除しない', async () => {
		const id = genId();
		const user = await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: { id, username: `honoqueuedelacctsoft${id}`, usernameLower: `honoqueuedelacctsoft${id}`.toLowerCase() },
			profile: { userId: id },
		});

		await handleHonoQueueDeleteAccount(deps, fakeJob({ user: { id: user.id }, soft: true }));

		expect(await fetchUserByIdFromDatabase(runtime.db, user.id)).not.toBeNull();
	});

	test('調整IDのないローカル物理削除ジョブを回復不能エラーとして拒否する', async () => {
		const id = genId();
		const user = await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: { id, username: `honoqueuedelacctlegacy${id}`, usernameLower: `honoqueuedelacctlegacy${id}`.toLowerCase() },
			profile: { userId: id },
		});

		try {
			await expect(
				handleHonoQueueDeleteAccount(deps, fakeJob({ user: { id: user.id }, soft: false }, `legacy-${user.id}`)),
			).rejects.toThrow('Local account deletion requires an outbox coordinator');
			expect(await fetchUserByIdFromDatabase(runtime.db, user.id)).not.toBeNull();
		} finally {
			await deleteUserByIdFromDatabase(runtime.db, user.id);
		}
	});

	test('存在しないuserIdは何もしない', async () => {
		await expect(
			handleHonoQueueDeleteAccount(deps, fakeJob({ user: { id: genId() }, soft: false })),
		).resolves.toBeUndefined();
	});
});
