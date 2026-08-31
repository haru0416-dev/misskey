/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// createRuntimeDependencies() が構築する UrlPreviewService は rolldown の `define` で注入される
// _SUMMALY_VERSION_ を参照するが、vitest はソースを直接importするだけでrolldownを経由しないため
// 未定義を避けるため、テスト用の固定値を注入する。
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/user/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { DB_MAX_NOTE_CW_LENGTH } from '@/const.js';
import { createNoteForApi, type ApiNotesCreateDependencies } from '@/server/rest/note/notes-create.js';
import type { MiLocalUser } from '@/models/User.js';

/**
 * note.cw は varchar(512)。ローカル API は paramDef で 100 文字に制限しているが、
 * ActivityPub 経由の summary には長さの保証が無い。切らずに挿入すると DB エラーになり、
 * inbox ジョブが再試行され続ける。
 */
describe('createNoteForApi の cw', () => {
	let runtime: RuntimeDependencies;
	let deps: ApiNotesCreateDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = runtime as unknown as ApiNotesCreateDependencies;
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	async function createUser(): Promise<MiLocalUser> {
		const id = genId();
		return (await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: { id, username: `cwtest${id}`, usernameLower: `cwtest${id}` },
			profile: { userId: id },
		})) as MiLocalUser;
	}

	const base = {
		createdAt: new Date(),
		text: 'x',
		reply: null,
		renote: null,
		files: [],
		poll: null,
		localOnly: true,
		reactionAcceptance: null,
		visibility: 'home' as const,
		visibleUsers: [],
		channel: null,
	};

	test('列長を超える cw は切り詰められる', async () => {
		const user = await createUser();
		const note = await createNoteForApi(deps, user, { ...base, cw: 'あ'.repeat(DB_MAX_NOTE_CW_LENGTH + 88) }, false);

		expect(note.cw).toHaveLength(DB_MAX_NOTE_CW_LENGTH);
	});

	// 閾値が 1 ずれても列長ちょうどのケースだけでは気付けない。+1 で確かめる。
	test('列長 + 1 の cw は列長へ切り詰められる', async () => {
		const user = await createUser();
		const note = await createNoteForApi(deps, user, { ...base, cw: 'う'.repeat(DB_MAX_NOTE_CW_LENGTH + 1) }, false);

		expect(note.cw).toHaveLength(DB_MAX_NOTE_CW_LENGTH);
	});

	test('列長以内の cw はそのまま保たれる', async () => {
		const user = await createUser();
		const cw = 'い'.repeat(DB_MAX_NOTE_CW_LENGTH);
		const note = await createNoteForApi(deps, user, { ...base, cw }, false);

		expect(note.cw).toBe(cw);
	});
});
