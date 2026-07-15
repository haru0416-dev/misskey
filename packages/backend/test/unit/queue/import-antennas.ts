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
import { listAntennasByUserIdFromDatabase } from '@/core/AntennaStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { handleHonoQueueImportAntennas, type HonoQueueDbDependencies } from '@/queue/handlers/db.js';
import type { DBAntennaImportJobData } from '@/queue/types.js';
import type { MiUser } from '@/models/User.js';

function fakeJob(data: DBAntennaImportJobData): Bull.Job<DBAntennaImportJobData> {
	return { data, updateProgress: async () => {} } as unknown as Bull.Job<DBAntennaImportJobData>;
}

describe('hono-queue-db (importAntennas)', () => {
	let runtime: RuntimeDependencies;
	let deps: HonoQueueDbDependencies;
	let user: MiUser;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = { ...runtime, logger: runtime.loggerService.getLogger('test-import-antennas') };

		const id = genId();
		user = await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: { id, username: `honoqueueimpant${id}`, usernameLower: `honoqueueimpant${id}`.toLowerCase() },
			profile: { userId: id },
		});
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('妥当なアンテナはインポートされる', async () => {
		await handleHonoQueueImportAntennas(deps, fakeJob({
			user: { id: user.id },
			antenna: [{
				name: 'imported-antenna',
				src: 'all',
				userListAccts: null,
				keywords: [['hello']],
				excludeKeywords: [[]],
				users: [],
				caseSensitive: false,
				localOnly: false,
				excludeBots: false,
				withReplies: false,
				withFile: false,
				excludeNotesInSensitiveChannel: false,
			}] as never,
		}));

		const antennas = await listAntennasByUserIdFromDatabase(runtime.db, user.id);
		expect(antennas.some(a => a.name === 'imported-antenna')).toBe(true);
	});

	test('キーワードが空のアンテナはスキップされる', async () => {
		await handleHonoQueueImportAntennas(deps, fakeJob({
			user: { id: user.id },
			antenna: [{
				name: 'empty-keyword-antenna',
				src: 'all',
				userListAccts: null,
				keywords: [['']],
				excludeKeywords: [[]],
				users: [],
				caseSensitive: false,
				localOnly: false,
				excludeBots: false,
				withReplies: false,
				withFile: false,
				excludeNotesInSensitiveChannel: false,
			}] as never,
		}));

		const antennas = await listAntennasByUserIdFromDatabase(runtime.db, user.id);
		expect(antennas.some(a => a.name === 'empty-keyword-antenna')).toBe(false);
	});

	test('スキーマ不正なアンテナはスキップされる', async () => {
		await handleHonoQueueImportAntennas(deps, fakeJob({
			user: { id: user.id },
			antenna: [{
				name: 'invalid-src-antenna',
				src: 'not-a-real-src',
				userListAccts: null,
				keywords: [['hello']],
				excludeKeywords: [[]],
				users: [],
				caseSensitive: false,
				localOnly: false,
				excludeBots: false,
				withReplies: false,
				withFile: false,
				excludeNotesInSensitiveChannel: false,
			}] as never,
		}));

		const antennas = await listAntennasByUserIdFromDatabase(runtime.db, user.id);
		expect(antennas.some(a => a.name === 'invalid-src-antenna')).toBe(false);
	});
});
