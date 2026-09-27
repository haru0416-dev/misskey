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
import { createPollInDatabase, fetchPollByNoteIdFromDatabase } from '@/core/note/PollStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { updateQuestionFromApForApi, voteFromApForApi } from '@/server/rest/activitypub/ap-note.js';
import { createBlockingInDatabase } from '@/core/user/BlockingStore.js';
import { listPollVotesByNoteAndUserFromDatabase } from '@/core/note/PollVoteStore.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
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

describe('voteFromApForApi', () => {
	let runtime: RuntimeDependencies;
	let deps: ApiApNoteDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = {
			...runtime,
			logger: runtime.loggerService.getLogger('test-ap-note-vote'),
		} as unknown as ApiApNoteDependencies;
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	async function createUser(host: string | null): Promise<MiUser> {
		const id = genId();
		return await createUserWithProfileAndPublickeyInDatabase(deps.db, {
			user: {
				id,
				username: `vote${id}`,
				usernameLower: `vote${id}`,
				host,
				...(host == null ? {} : { uri: `https://${host}/users/${id}`, inbox: `https://${host}/users/${id}/inbox` }),
			},
			profile: { userId: id },
		});
	}

	async function createLocalPoll(visibility: 'public' | 'followers'): Promise<{ owner: MiUser; note: MiNote }> {
		const owner = await createUser(null);
		const noteId = genId();
		await createNoteInDatabase(deps.db, { id: noteId, userId: owner.id, visibility, hasPoll: true, text: 'poll' });
		await createPollInDatabase(deps.db, {
			noteId,
			userId: owner.id,
			userHost: null,
			noteVisibility: visibility,
			choices: ['a', 'b'],
			votes: [0, 0],
			multiple: false,
			expiresAt: null,
		});
		return { owner, note: (await fetchNoteByIdFromDatabase(deps.db, noteId))! };
	}

	test('投票の作者にブロックされたリモートの票は入れない', async () => {
		const { owner, note } = await createLocalPoll('public');
		const voter = await createUser('vote-blocked.example');
		await createBlockingInDatabase(deps.db, { id: genId(), blockerId: owner.id, blockeeId: voter.id });

		await expect(voteFromApForApi(deps, voter, note, 0)).rejects.toThrow();
		expect(await listPollVotesByNoteAndUserFromDatabase(deps.db, note.id, voter.id)).toHaveLength(0);
	});

	test('フォロワー限定の投票に、フォローしていないリモートの票は入れない', async () => {
		const { note } = await createLocalPoll('followers');
		const voter = await createUser('vote-outsider.example');

		await expect(voteFromApForApi(deps, voter, note, 0)).rejects.toThrow();
		expect(await listPollVotesByNoteAndUserFromDatabase(deps.db, note.id, voter.id)).toHaveLength(0);
	});

	test('単一選択の投票に同時に届いた票は 1 票だけ入れる', async () => {
		const { note } = await createLocalPoll('public');
		const voter = await createUser('vote-parallel.example');

		const results = await Promise.allSettled([
			voteFromApForApi(deps, voter, note, 0),
			voteFromApForApi(deps, voter, note, 1),
			voteFromApForApi(deps, voter, note, 0),
			voteFromApForApi(deps, voter, note, 1),
		]);
		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
		expect(await listPollVotesByNoteAndUserFromDatabase(deps.db, note.id, voter.id)).toHaveLength(1);
		expect((await fetchPollByNoteIdFromDatabase(deps.db, note.id))?.votes.reduce((a, b) => a + b, 0)).toBe(1);
	});
});
