/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/user/UserStore.js';
import { createNoteInDatabase } from '@/core/note/NoteStore.js';
import { createPollInDatabase, fetchPollByNoteIdFromDatabase } from '@/core/note/PollStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { updateQuestionFromApForApi } from '@/server/rest/activitypub/ap-note.js';
import type { ApiApNoteDependencies } from '@/server/rest/activitypub/ap-note.js';
import type { IObject } from '@/core/activitypub/type.js';

describe('updateQuestionFromApForApi', () => {
	let runtime: RuntimeDependencies;
	let deps: ApiApNoteDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = {
			...runtime,
			logger: runtime.loggerService.getLogger('test-ap-note-poll'),
		} as unknown as ApiApNoteDependencies;
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	async function createRemotePoll(choices: string[]) {
		const userId = genId();
		const userUri = `https://poll.example/users/${userId}`;
		await createUserWithProfileAndPublickeyInDatabase(deps.db, {
			user: {
				id: userId,
				username: `poll${userId}`,
				usernameLower: `poll${userId}`,
				host: 'poll.example',
				uri: userUri,
			},
			profile: { userId },
		});
		const noteId = genId();
		const noteUri = `https://poll.example/notes/${noteId}`;
		await createNoteInDatabase(deps.db, {
			id: noteId,
			userId,
			userHost: 'poll.example',
			uri: noteUri,
			visibility: 'public',
			hasPoll: true,
			text: 'poll',
		});
		await createPollInDatabase(deps.db, {
			noteId,
			userId,
			userHost: 'poll.example',
			noteVisibility: 'public',
			choices,
			votes: choices.map(() => 0),
			multiple: false,
			expiresAt: null,
		});
		return { noteId, noteUri, userUri };
	}

	const question = (id: string, attributedTo: string, oneOf: { name: string; count: number }[]) =>
		({
			type: 'Question',
			id,
			attributedTo,
			oneOf: oneOf.map(({ name, count }) => ({
				type: 'Note',
				name,
				replies: { type: 'Collection', totalItems: count },
			})),
		}) as unknown as IObject;

	test('選択肢の名前で票数を更新し、同名の選択肢は先頭の票数を使う', async () => {
		const { noteId, noteUri, userUri } = await createRemotePoll(['a', 'b', 'a']);
		const changed = await updateQuestionFromApForApi(
			deps,
			question(noteUri, userUri, [
				{ name: 'a', count: 5 },
				{ name: 'b', count: 2 },
				{ name: 'a', count: 9 },
			]),
		);
		expect(changed).toBe(true);
		expect((await fetchPollByNoteIdFromDatabase(deps.db, noteId))?.votes).toStrictEqual([5, 2, 5]);
	});

	test('保存済みの選択肢が相手に無ければ更新しない', async () => {
		const { noteId, noteUri, userUri } = await createRemotePoll(['a', 'b']);
		await expect(
			updateQuestionFromApForApi(deps, question(noteUri, userUri, [{ name: 'a', count: 1 }])),
		).rejects.toThrow('invalid newCount');
		expect((await fetchPollByNoteIdFromDatabase(deps.db, noteId))?.votes).toStrictEqual([0, 0]);
	});
});
