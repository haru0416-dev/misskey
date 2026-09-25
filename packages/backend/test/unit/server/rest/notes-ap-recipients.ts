/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/user/UserStore.js';
import { createNoteInDatabase, fetchNoteByIdFromDatabase } from '@/core/note/NoteStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { resolveMentionedAndInvolvedRemoteUsersForApi } from '@/server/rest/activitypub/notes-ap.js';
import type { ApiNoteApDependencies } from '@/server/rest/activitypub/notes-ap.js';

describe('resolveMentionedAndInvolvedRemoteUsersForApi', () => {
	let runtime: RuntimeDependencies;
	let deps: ApiNoteApDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = runtime as unknown as ApiNoteApDependencies;
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	async function createUser(host: string | null) {
		const id = genId();
		await createUserWithProfileAndPublickeyInDatabase(deps.db, {
			user: {
				id,
				username: `rcpt${id}`,
				usernameLower: `rcpt${id}`,
				host,
				uri: host == null ? null : `https://${host}/users/${id}`,
			},
			profile: { userId: id },
		});
		return id;
	}

	test('同じリモートユーザーの多数の返信・リノートは宛先 1 人にまとめる', async () => {
		const author = await createUser(null);
		const remote = await createUser('recipients.example');
		const other = await createUser('recipients.example');
		const noteId = genId();
		await createNoteInDatabase(deps.db, {
			id: noteId,
			userId: author,
			userHost: null,
			visibility: 'public',
			text: 'x',
		});
		for (const [userId, field] of [
			[remote, 'replyId'],
			[remote, 'replyId'],
			[remote, 'replyId'],
			[remote, 'renoteId'],
			[other, 'replyId'],
		] as const) {
			await createNoteInDatabase(deps.db, {
				id: genId(),
				userId,
				userHost: 'recipients.example',
				visibility: 'public',
				text: 'r',
				[field]: noteId,
			});
		}

		const note = await fetchNoteByIdFromDatabase(deps.db, noteId);
		const users = await resolveMentionedAndInvolvedRemoteUsersForApi(deps, note!);
		expect(users.map((user) => user.id).toSorted()).toStrictEqual([remote, other].toSorted());
	});
});
