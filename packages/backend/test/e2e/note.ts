/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'assert';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { MAX_NOTE_TEXT_LENGTH } from '@/const.js';
import { fetchNoteByIdFromDatabase, openTestDatabase, type TestDatabase } from '../fixtures.js';
import { api, castAsError, initTestDb, POLL, post, role, signup, uploadFile } from '../utils.js';
import type * as misskey from 'misskey-js';

describe('Note', () => {
	let database: TestDatabase;

	let root: misskey.entities.SignupResponse;
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	let tom: misskey.entities.SignupResponse;

	beforeAll(
		async () => {
			await initTestDb(true);
			database = openTestDatabase();
			root = await signup({ username: 'root' });
			alice = await signup({ username: 'alice' });
			bob = await signup({ username: 'bob' });
			tom = await signup({ username: 'tom', host: 'example.com' });
		},
		1000 * 60 * 2,
	);

	afterAll(async () => {
		await database.close();
	});

	test('投稿できる', async () => {
		const post = {
			text: 'test',
		};

		const res = await api('notes/create', post, alice);

		expect(res.status).toBe(200);
		expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
		expect(res.body.createdNote.text).toBe(post.text);
	});

	test('お気に入りを作成・取得・削除できる', async () => {
		const note = await post(bob, {
			text: 'favorite target',
		});

		const initialState = await api('notes/state', { noteId: note.id }, alice);
		expect(initialState.status).toBe(200);
		expect(initialState.body.isFavorited).toBe(false);

		const create = await api('notes/favorites/create', { noteId: note.id }, alice);
		expect(create.status).toBe(204);

		const favoritedState = await api('notes/state', { noteId: note.id }, alice);
		expect(favoritedState.status).toBe(200);
		expect(favoritedState.body.isFavorited).toBe(true);

		const duplicate = await api('notes/favorites/create', { noteId: note.id }, alice);
		expect(duplicate.status).toBe(400);
		expect(castAsError(duplicate.body as any).error.code).toBe('ALREADY_FAVORITED');

		const favorites = await api('i/favorites', { limit: 10 }, alice);
		expect(favorites.status).toBe(200);
		assert.ok(
			favorites.body.some((favorite) => favorite.noteId === note.id && favorite.note.text === 'favorite target'),
		);

		const remove = await api('notes/favorites/delete', { noteId: note.id }, alice);
		expect(remove.status).toBe(204);

		const removedState = await api('notes/state', { noteId: note.id }, alice);
		expect(removedState.status).toBe(200);
		expect(removedState.body.isFavorited).toBe(false);

		const removedFavorites = await api('i/favorites', { limit: 10 }, alice);
		expect(removedFavorites.status).toBe(200);
		expect(removedFavorites.body.some((favorite) => favorite.noteId === note.id)).toBe(false);

		const duplicateRemove = await api('notes/favorites/delete', { noteId: note.id }, alice);
		expect(duplicateRemove.status).toBe(400);
		expect(castAsError(duplicateRemove.body as any).error.code).toBe('NOT_FAVORITED');
	});

	test(
		'ファイルを添付できる',
		async () => {
			const file = await uploadFile(alice);

			const res = await api(
				'notes/create',
				{
					fileIds: [file.body!.id],
				},
				alice,
			);

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
			expect(res.body.createdNote.fileIds).toStrictEqual([file.body!.id]);
		},
		1000 * 10,
	);

	test(
		'他人のファイルで怒られる',
		async () => {
			const file = await uploadFile(bob);

			const res = await api(
				'notes/create',
				{
					text: 'test',
					fileIds: [file.body!.id],
				},
				alice,
			);

			expect(res.status).toBe(400);
			expect(castAsError(res.body).error.code).toBe('NO_SUCH_FILE');
			expect(castAsError(res.body).error.id).toBe('b6992544-63e7-67f0-fa7f-32444b1b5306');
		},
		1000 * 10,
	);

	test('存在しないファイルで怒られる', async () => {
		const res = await api(
			'notes/create',
			{
				text: 'test',
				fileIds: ['000000000000000000000000'],
			},
			alice,
		);

		expect(res.status).toBe(400);
		expect(castAsError(res.body).error.code).toBe('NO_SUCH_FILE');
		expect(castAsError(res.body).error.id).toBe('b6992544-63e7-67f0-fa7f-32444b1b5306');
	});

	test('不正なファイルIDで怒られる', async () => {
		const res = await api(
			'notes/create',
			{
				fileIds: ['kyoppie'],
			},
			alice,
		);
		expect(res.status).toBe(400);
		expect(castAsError(res.body).error.code).toBe('NO_SUCH_FILE');
		expect(castAsError(res.body).error.id).toBe('b6992544-63e7-67f0-fa7f-32444b1b5306');
	});

	test('返信できる', async () => {
		const bobPost = await post(bob, {
			text: 'foo',
		});

		const alicePost = {
			text: 'bar',
			replyId: bobPost.id,
		};

		const res = await api('notes/create', alicePost, alice);

		expect(res.status).toBe(200);
		expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
		expect(res.body.createdNote.text).toBe(alicePost.text);
		expect(res.body.createdNote.replyId).toBe(alicePost.replyId);
		assert.ok(res.body.createdNote.reply);
		expect(res.body.createdNote.reply.text).toBe(bobPost.text);
	});

	test('renoteできる', async () => {
		const bobPost = await post(bob, {
			text: 'test',
		});

		const alicePost = {
			renoteId: bobPost.id,
		};

		const res = await api('notes/create', alicePost, alice);

		expect(res.status).toBe(200);
		expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
		expect(res.body.createdNote.renoteId).toBe(alicePost.renoteId);
		assert.ok(res.body.createdNote.renote);
		expect(res.body.createdNote.renote.text).toBe(bobPost.text);
	});

	test('引用renoteできる', async () => {
		const bobPost = await post(bob, {
			text: 'test',
		});

		const alicePost = {
			text: 'test',
			renoteId: bobPost.id,
		};

		const res = await api('notes/create', alicePost, alice);

		expect(res.status).toBe(200);
		expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
		expect(res.body.createdNote.text).toBe(alicePost.text);
		expect(res.body.createdNote.renoteId).toBe(alicePost.renoteId);
		assert.ok(res.body.createdNote.renote);
		expect(res.body.createdNote.renote.text).toBe(bobPost.text);
	});

	test('引用renoteで空白文字のみで構成されたtextにするとレスポンスがtext: nullになる', async () => {
		const bobPost = await post(bob, {
			text: 'test',
		});
		const res = await api(
			'notes/create',
			{
				text: ' ',
				renoteId: bobPost.id,
			},
			alice,
		);

		expect(res.status).toBe(200);
		expect(res.body.createdNote.text).toBe(null);
	});

	test('visibility: followersでrenoteできる', async () => {
		const createRes = await api(
			'notes/create',
			{
				text: 'test',
				visibility: 'followers',
			},
			alice,
		);

		expect(createRes.status).toBe(200);

		const renoteId = createRes.body.createdNote.id;
		const renoteRes = await api(
			'notes/create',
			{
				visibility: 'followers',
				renoteId,
			},
			alice,
		);

		expect(renoteRes.status).toBe(200);
		expect(renoteRes.body.createdNote.renoteId).toBe(renoteId);
		expect(renoteRes.body.createdNote.visibility).toBe('followers');

		const deleteRes = await api(
			'notes/delete',
			{
				noteId: renoteRes.body.createdNote.id,
			},
			alice,
		);

		expect(deleteRes.status).toBe(204);
	});

	test('visibility: followersなノートに対してフォロワーはリプライできる', async () => {
		await api(
			'following/create',
			{
				userId: alice.id,
			},
			bob,
		);

		const aliceNote = await api(
			'notes/create',
			{
				text: 'direct note to bob',
				visibility: 'followers',
			},
			alice,
		);

		expect(aliceNote.status).toBe(200);

		const replyId = aliceNote.body.createdNote.id;
		const bobReply = await api(
			'notes/create',
			{
				text: 'reply to alice note',
				replyId,
			},
			bob,
		);

		expect(bobReply.status).toBe(200);
		expect(bobReply.body.createdNote.replyId).toBe(replyId);

		await api(
			'following/delete',
			{
				userId: alice.id,
			},
			bob,
		);
	});

	test('visibility: followersなノートに対してフォロワーでないユーザーがリプライしようとすると怒られる', async () => {
		const aliceNote = await api(
			'notes/create',
			{
				text: 'direct note to bob',
				visibility: 'followers',
			},
			alice,
		);

		expect(aliceNote.status).toBe(200);

		const bobReply = await api(
			'notes/create',
			{
				text: 'reply to alice note',
				replyId: aliceNote.body.createdNote.id,
			},
			bob,
		);

		expect(bobReply.status).toBe(400);
		expect(castAsError(bobReply.body).error.code).toBe('CANNOT_REPLY_TO_AN_INVISIBLE_NOTE');
	});

	test('visibility: followersなノートにvisibility: publicで返信すると、返信もfollowersになる', async () => {
		const aliceNote = await api(
			'notes/create',
			{
				text: 'followers only note',
				visibility: 'followers',
			},
			alice,
		);

		expect(aliceNote.status).toBe(200);

		// 返信が public のまま通ると、フォロワー限定投稿にぶら下がったスレッドが第三者から見えてしまう
		const aliceReply = await api(
			'notes/create',
			{
				text: 'reply to my own followers note',
				replyId: aliceNote.body.createdNote.id,
				visibility: 'public',
			},
			alice,
		);

		expect(aliceReply.status).toBe(200);
		expect(aliceReply.body.createdNote.visibility).toBe('followers');
	});

	test('visibility: specifiedなノートに対してvisibility: specifiedで返信できる', async () => {
		const aliceNote = await api(
			'notes/create',
			{
				text: 'direct note to bob',
				visibility: 'specified',
				visibleUserIds: [bob.id],
			},
			alice,
		);

		expect(aliceNote.status).toBe(200);

		const bobReply = await api(
			'notes/create',
			{
				text: 'reply to alice note',
				replyId: aliceNote.body.createdNote.id,
				visibility: 'specified',
				visibleUserIds: [alice.id],
			},
			bob,
		);

		expect(bobReply.status).toBe(200);
	});

	test('visibility: specifiedなノートに対してvisibility: follwersで返信しようとすると怒られる', async () => {
		const aliceNote = await api(
			'notes/create',
			{
				text: 'direct note to bob',
				visibility: 'specified',
				visibleUserIds: [bob.id],
			},
			alice,
		);

		expect(aliceNote.status).toBe(200);

		const bobReply = await api(
			'notes/create',
			{
				text: 'reply to alice note with visibility: followers',
				replyId: aliceNote.body.createdNote.id,
				visibility: 'followers',
			},
			bob,
		);

		expect(bobReply.status).toBe(400);
		expect(castAsError(bobReply.body).error.code).toBe(
			'CANNOT_REPLY_TO_SPECIFIED_VISIBILITY_NOTE_WITH_EXTENDED_VISIBILITY',
		);
	});

	test('文字数ぎりぎりで怒られない', async () => {
		const post = {
			text: '!'.repeat(MAX_NOTE_TEXT_LENGTH), // 3000文字
		};
		const res = await api('notes/create', post, alice);
		expect(res.status).toBe(200);
	});

	test('文字数オーバーで怒られる', async () => {
		const post = {
			text: '!'.repeat(MAX_NOTE_TEXT_LENGTH + 1), // 3001文字
		};
		const res = await api('notes/create', post, alice);
		expect(res.status).toBe(400);
	});

	test('存在しないリプライ先で怒られる', async () => {
		const post = {
			text: 'test',
			replyId: '000000000000000000000000',
		};
		const res = await api('notes/create', post, alice);
		expect(res.status).toBe(400);
	});

	test('存在しないrenote対象で怒られる', async () => {
		const post = {
			renoteId: '000000000000000000000000',
		};
		const res = await api('notes/create', post, alice);
		expect(res.status).toBe(400);
	});

	test('不正なリプライ先IDで怒られる', async () => {
		const post = {
			text: 'test',
			replyId: 'foo',
		};
		const res = await api('notes/create', post, alice);
		expect(res.status).toBe(400);
	});

	test('不正なrenote対象IDで怒られる', async () => {
		const post = {
			renoteId: 'foo',
		};
		const res = await api('notes/create', post, alice);
		expect(res.status).toBe(400);
	});

	test('存在しないユーザーにメンションできる', async () => {
		const post = {
			text: '@ghost yo',
		};

		const res = await api('notes/create', post, alice);

		expect(res.status).toBe(200);
		expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
		expect(res.body.createdNote.text).toBe(post.text);
	});

	test('同じユーザーに複数メンションしても内部的にまとめられる', async () => {
		const post = {
			text: '@bob @bob @bob yo',
		};

		const res = await api('notes/create', post, alice);

		expect(res.status).toBe(200);
		expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
		expect(res.body.createdNote.text).toBe(post.text);

		const noteDoc = await fetchNoteByIdFromDatabase(database, res.body.createdNote.id);
		assert.ok(noteDoc);
		expect(noteDoc.mentions).toStrictEqual([bob.id]);
	});

	describe('添付ファイル情報', () => {
		test('ファイルを添付した場合、投稿成功時にファイル情報入りのレスポンスが帰ってくる', async () => {
			const file = await uploadFile(alice);
			const res = await api(
				'notes/create',
				{
					fileIds: [file.body!.id],
				},
				alice,
			);

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
			assert.ok(res.body.createdNote.files);
			expect(res.body.createdNote.files.length).toBe(1);
			expect(res.body.createdNote.files[0]?.id).toBe(file.body!.id);
		});

		test('ファイルを添付した場合、タイムラインでファイル情報入りのレスポンスが帰ってくる', async () => {
			const file = await uploadFile(alice);
			const createdNote = await api(
				'notes/create',
				{
					fileIds: [file.body!.id],
				},
				alice,
			);

			expect(createdNote.status).toBe(200);

			const res = await api(
				'notes',
				{
					withFiles: true,
				},
				alice,
			);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
			const myNote = res.body.find((note) => note.id === createdNote.body.createdNote.id);
			assert.ok(myNote);
			assert.ok(myNote.files);
			expect(myNote.files.length).toBe(1);
			expect(myNote.files[0]?.id).toBe(file.body!.id);
		});

		test('ファイルが添付されたノートをリノートした場合、タイムラインでファイル情報入りのレスポンスが帰ってくる', async () => {
			const file = await uploadFile(alice);
			const createdNote = await api(
				'notes/create',
				{
					fileIds: [file.body!.id],
				},
				alice,
			);

			expect(createdNote.status).toBe(200);

			const renoted = await api(
				'notes/create',
				{
					renoteId: createdNote.body.createdNote.id,
				},
				alice,
			);
			expect(renoted.status).toBe(200);

			const res = await api(
				'notes',
				{
					renote: true,
				},
				alice,
			);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
			const myNote = res.body.find((note: { id: string }) => note.id === renoted.body.createdNote.id);
			assert.ok(myNote);
			assert.ok(myNote.renote);
			assert.ok(myNote.renote.files);
			expect(myNote.renote.files.length).toBe(1);
			expect(myNote.renote.files[0]?.id).toBe(file.body!.id);
		});

		test('ファイルが添付されたノートに返信した場合、タイムラインでファイル情報入りのレスポンスが帰ってくる', async () => {
			const file = await uploadFile(alice);
			const createdNote = await api(
				'notes/create',
				{
					fileIds: [file.body!.id],
				},
				alice,
			);

			expect(createdNote.status).toBe(200);

			const reply = await api(
				'notes/create',
				{
					replyId: createdNote.body.createdNote.id,
					text: 'this is reply',
				},
				alice,
			);
			expect(reply.status).toBe(200);

			const res = await api(
				'notes',
				{
					reply: true,
				},
				alice,
			);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
			const myNote = res.body.find((note: { id: string }) => note.id === reply.body.createdNote.id);
			assert.ok(myNote);
			assert.ok(myNote.reply);
			assert.ok(myNote.reply.files);
			expect(myNote.reply.files.length).toBe(1);
			expect(myNote.reply.files[0]?.id).toBe(file.body!.id);
		});

		test('ファイルが添付されたノートへの返信をリノートした場合、タイムラインでファイル情報入りのレスポンスが帰ってくる', async () => {
			const file = await uploadFile(alice);
			const createdNote = await api(
				'notes/create',
				{
					fileIds: [file.body!.id],
				},
				alice,
			);

			expect(createdNote.status).toBe(200);

			const reply = await api(
				'notes/create',
				{
					replyId: createdNote.body.createdNote.id,
					text: 'this is reply',
				},
				alice,
			);
			expect(reply.status).toBe(200);

			const renoted = await api(
				'notes/create',
				{
					renoteId: reply.body.createdNote.id,
				},
				alice,
			);
			expect(renoted.status).toBe(200);

			const res = await api(
				'notes',
				{
					renote: true,
				},
				alice,
			);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
			const myNote = res.body.find((note: { id: string }) => note.id === renoted.body.createdNote.id);
			assert.ok(myNote);
			assert.ok(myNote.renote);
			assert.ok(myNote.renote.reply);
			assert.ok(myNote.renote.reply.files);
			expect(myNote.renote.reply.files.length).toBe(1);
			expect(myNote.renote.reply.files[0]?.id).toBe(file.body!.id);
		});

		test('NSFWが強制されている場合変更できない', async () => {
			const file = await uploadFile(alice);

			const res = await api(
				'admin/roles/create',
				{
					name: 'test',
					description: '',
					color: null,
					iconUrl: null,
					displayOrder: 0,
					target: 'manual',
					condFormula: {},
					isAdministrator: false,
					isModerator: false,
					isPublic: false,
					isExplorable: false,
					asBadge: false,
					canEditMembersByModerator: false,
					policies: {
						alwaysMarkNsfw: {
							useDefault: false,
							priority: 0,
							value: true,
						},
					},
				},
				root,
			);

			expect(res.status).toBe(200);

			const assign = await api(
				'admin/roles/assign',
				{
					userId: alice.id,
					roleId: res.body.id,
				},
				root,
			);

			expect(assign.status).toBe(204);
			expect(file.body!.isSensitive).toBe(false);

			const nsfwfile = await uploadFile(alice);

			expect(nsfwfile.status).toBe(200);
			expect(nsfwfile.body!.isSensitive).toBe(true);

			const liftnsfw = await api(
				'drive/files/update',
				{
					fileId: nsfwfile.body!.id,
					isSensitive: false,
				},
				alice,
			);

			expect(liftnsfw.status).toBe(400);
			expect(castAsError(liftnsfw.body).error.code).toBe('RESTRICTED_BY_ROLE');

			const oldaddnsfw = await api(
				'drive/files/update',
				{
					fileId: file.body!.id,
					isSensitive: true,
				},
				alice,
			);

			expect(oldaddnsfw.status).toBe(200);

			await api(
				'admin/roles/unassign',
				{
					userId: alice.id,
					roleId: res.body.id,
				},
				root,
			);

			await api(
				'admin/roles/delete',
				{
					roleId: res.body.id,
				},
				root,
			);
		});
	});

	describe('notes/create', () => {
		test('投票を添付できる', async () => {
			const res = await api(
				'notes/create',
				{
					text: 'test',
					poll: {
						choices: ['foo', 'bar'],
					},
				},
				alice,
			);

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
			expect(res.body.createdNote.poll != null).toBe(true);
		});

		test('投票の選択肢が無くて怒られる', async () => {
			const res = await api(
				'notes/create',
				{
					// @ts-expect-error poll must not be empty
					poll: {},
				},
				alice,
			);
			expect(res.status).toBe(400);
		});

		test('投票の選択肢が無くて怒られる (空の配列)', async () => {
			const res = await api(
				'notes/create',
				{
					poll: {
						choices: [],
					},
				},
				alice,
			);
			expect(res.status).toBe(400);
		});

		test('投票の選択肢が1つで怒られる', async () => {
			const res = await api(
				'notes/create',
				{
					poll: {
						choices: ['Strawberry Pasta'],
					},
				},
				alice,
			);
			expect(res.status).toBe(400);
		});

		test('投票できる', async () => {
			const { body } = await api(
				'notes/create',
				{
					text: 'test',
					poll: {
						choices: ['sakura', 'izumi', 'ako'],
					},
				},
				alice,
			);

			const res = await api(
				'notes/polls/vote',
				{
					noteId: body.createdNote.id,
					choice: 1,
				},
				alice,
			);

			expect(res.status).toBe(204);
		});

		test('複数投票できない', async () => {
			const { body } = await api(
				'notes/create',
				{
					text: 'test',
					poll: {
						choices: ['sakura', 'izumi', 'ako'],
					},
				},
				alice,
			);

			await api(
				'notes/polls/vote',
				{
					noteId: body.createdNote.id,
					choice: 0,
				},
				alice,
			);

			const res = await api(
				'notes/polls/vote',
				{
					noteId: body.createdNote.id,
					choice: 2,
				},
				alice,
			);

			expect(res.status).toBe(400);
		});

		test('許可されている場合は複数投票できる', async () => {
			const { body } = await api(
				'notes/create',
				{
					text: 'test',
					poll: {
						choices: ['sakura', 'izumi', 'ako'],
						multiple: true,
					},
				},
				alice,
			);

			await api(
				'notes/polls/vote',
				{
					noteId: body.createdNote.id,
					choice: 0,
				},
				alice,
			);

			await api(
				'notes/polls/vote',
				{
					noteId: body.createdNote.id,
					choice: 1,
				},
				alice,
			);

			const res = await api(
				'notes/polls/vote',
				{
					noteId: body.createdNote.id,
					choice: 2,
				},
				alice,
			);

			expect(res.status).toBe(204);
		});

		test('締め切られている場合は投票できない', async () => {
			const { body } = await api(
				'notes/create',
				{
					text: 'test',
					poll: {
						choices: ['sakura', 'izumi', 'ako'],
						expiredAfter: 1,
					},
				},
				alice,
			);

			// 投票期限そのものが過ぎるのを待つ (状態の伝播待ちではないので固定で待つ)
			await new Promise((x) => setTimeout(x, 2));

			const res = await api(
				'notes/polls/vote',
				{
					noteId: body.createdNote.id,
					choice: 1,
				},
				alice,
			);

			expect(res.status).toBe(400);
		});

		test('センシティブな投稿はhomeになる (単語指定)', async () => {
			const sensitive = await api(
				'admin/update-meta',
				{
					sensitiveWords: ['test'],
				},
				root,
			);

			expect(sensitive.status).toBe(204);

			// meta の伝播待ち。成功する呼び出しはノートを作るので、投げ直さず固定で待つ。
			await new Promise((x) => setTimeout(x, 2));

			const note1 = await api(
				'notes/create',
				{
					text: 'hogetesthuge',
				},
				alice,
			);

			expect(note1.status).toBe(200);
			expect(note1.body.createdNote.visibility).toBe('home');
		});

		test('センシティブな投稿はhomeになる (正規表現)', async () => {
			const sensitive = await api(
				'admin/update-meta',
				{
					sensitiveWords: ['/Test/i'],
				},
				root,
			);

			expect(sensitive.status).toBe(204);

			const note2 = await api(
				'notes/create',
				{
					text: 'hogetesthuge',
				},
				alice,
			);

			expect(note2.status).toBe(200);
			expect(note2.body.createdNote.visibility).toBe('home');
		});

		test('センシティブな投稿はhomeになる (スペースアンド)', async () => {
			const sensitive = await api(
				'admin/update-meta',
				{
					sensitiveWords: ['Test hoge'],
				},
				root,
			);

			expect(sensitive.status).toBe(204);

			const note2 = await api(
				'notes/create',
				{
					text: 'hogeTesthuge',
				},
				alice,
			);

			expect(note2.status).toBe(200);
			expect(note2.body.createdNote.visibility).toBe('home');
		});

		test('禁止ワードを含む投稿はエラーになる (単語指定)', async () => {
			const prohibited = await api(
				'admin/update-meta',
				{
					prohibitedWords: ['test'],
				},
				root,
			);

			expect(prohibited.status).toBe(204);

			// reactive meta / ロールの伝播は Redis pub/sub 経由で、外から観測できる口が無い。
			// 却下される呼び出しはノートを作らないので、効くまで投げ直して待つ。
			await vi.waitFor(async () => {
				const rejected = await api(
					'notes/create',
					{
						text: 'hogetesthuge',
					},
					alice,
				);

				expect(rejected.status).toBe(400);
				expect(castAsError(rejected.body).error.code).toBe('CONTAINS_PROHIBITED_WORDS');
			}, POLL);
		});

		test('禁止ワードを含む投稿はエラーになる (正規表現)', async () => {
			const prohibited = await api(
				'admin/update-meta',
				{
					prohibitedWords: ['/Test/i'],
				},
				root,
			);

			expect(prohibited.status).toBe(204);

			const note2 = await api(
				'notes/create',
				{
					text: 'hogetesthuge',
				},
				alice,
			);

			expect(note2.status).toBe(400);
			expect(castAsError(note2.body).error.code).toBe('CONTAINS_PROHIBITED_WORDS');
		});

		test('禁止ワードを含む投稿はエラーになる (スペースアンド)', async () => {
			const prohibited = await api(
				'admin/update-meta',
				{
					prohibitedWords: ['Test hoge'],
				},
				root,
			);

			expect(prohibited.status).toBe(204);

			const note2 = await api(
				'notes/create',
				{
					text: 'hogeTesthuge',
				},
				alice,
			);

			expect(note2.status).toBe(400);
			expect(castAsError(note2.body).error.code).toBe('CONTAINS_PROHIBITED_WORDS');
		});

		test('禁止ワードを含んでるリモートノートもエラーになる', async () => {
			const prohibited = await api(
				'admin/update-meta',
				{
					prohibitedWords: ['test'],
				},
				root,
			);

			expect(prohibited.status).toBe(204);

			// reactive meta / ロールの伝播は Redis pub/sub 経由で、外から観測できる口が無い。
			// 却下される呼び出しはノートを作らないので、効くまで投げ直して待つ。
			await vi.waitFor(async () => {
				const rejected = await api(
					'notes/create',
					{
						text: 'hogetesthuge',
					},
					tom,
				);

				expect(rejected.status).toBe(400);
			}, POLL);
		});

		test('メンションの数が上限を超えるとエラーになる', async () => {
			const res = await api(
				'admin/roles/create',
				{
					name: 'test',
					description: '',
					color: null,
					iconUrl: null,
					displayOrder: 0,
					target: 'manual',
					condFormula: {},
					isAdministrator: false,
					isModerator: false,
					isPublic: false,
					isExplorable: false,
					asBadge: false,
					canEditMembersByModerator: false,
					policies: {
						mentionLimit: {
							useDefault: false,
							priority: 1,
							value: 0,
						},
					},
				},
				root,
			);

			expect(res.status).toBe(200);

			// ロール作成の伝播待ち。assign は投げ直すと二重割り当てになるので固定で待つ。
			await new Promise((x) => setTimeout(x, 2));

			const assign = await api(
				'admin/roles/assign',
				{
					userId: alice.id,
					roleId: res.body.id,
				},
				root,
			);

			expect(assign.status).toBe(204);

			// reactive meta / ロールの伝播は Redis pub/sub 経由で、外から観測できる口が無い。
			// 却下される呼び出しはノートを作らないので、効くまで投げ直して待つ。
			await vi.waitFor(async () => {
				const rejected = await api(
					'notes/create',
					{
						text: '@bob potentially annoying text',
					},
					alice,
				);

				expect(rejected.status).toBe(400);
				expect(castAsError(rejected.body).error.code).toBe('CONTAINS_TOO_MANY_MENTIONS');
			}, POLL);

			await api(
				'admin/roles/unassign',
				{
					userId: alice.id,
					roleId: res.body.id,
				},
				root,
			);

			await api(
				'admin/roles/delete',
				{
					roleId: res.body.id,
				},
				root,
			);
		});

		test('ダイレクト投稿もエラーになる', async () => {
			const res = await api(
				'admin/roles/create',
				{
					name: 'test',
					description: '',
					color: null,
					iconUrl: null,
					displayOrder: 0,
					target: 'manual',
					condFormula: {},
					isAdministrator: false,
					isModerator: false,
					isPublic: false,
					isExplorable: false,
					asBadge: false,
					canEditMembersByModerator: false,
					policies: {
						mentionLimit: {
							useDefault: false,
							priority: 1,
							value: 0,
						},
					},
				},
				root,
			);

			expect(res.status).toBe(200);

			// ロール作成の伝播待ち。assign は投げ直すと二重割り当てになるので固定で待つ。
			await new Promise((x) => setTimeout(x, 2));

			const assign = await api(
				'admin/roles/assign',
				{
					userId: alice.id,
					roleId: res.body.id,
				},
				root,
			);

			expect(assign.status).toBe(204);

			// reactive meta / ロールの伝播は Redis pub/sub 経由で、外から観測できる口が無い。
			// 却下される呼び出しはノートを作らないので、効くまで投げ直して待つ。
			await vi.waitFor(async () => {
				const rejected = await api(
					'notes/create',
					{
						text: 'potentially annoying text',
						visibility: 'specified',
						visibleUserIds: [bob.id],
					},
					alice,
				);

				expect(rejected.status).toBe(400);
				expect(castAsError(rejected.body).error.code).toBe('CONTAINS_TOO_MANY_MENTIONS');
			}, POLL);

			await api(
				'admin/roles/unassign',
				{
					userId: alice.id,
					roleId: res.body.id,
				},
				root,
			);

			await api(
				'admin/roles/delete',
				{
					roleId: res.body.id,
				},
				root,
			);
		});

		test('ダイレクトの宛先とメンションが同じ場合は重複してカウントしない', async () => {
			const res = await api(
				'admin/roles/create',
				{
					name: 'test',
					description: '',
					color: null,
					iconUrl: null,
					displayOrder: 0,
					target: 'manual',
					condFormula: {},
					isAdministrator: false,
					isModerator: false,
					isPublic: false,
					isExplorable: false,
					asBadge: false,
					canEditMembersByModerator: false,
					policies: {
						mentionLimit: {
							useDefault: false,
							priority: 1,
							value: 1,
						},
					},
				},
				root,
			);

			expect(res.status).toBe(200);

			// ロール作成の伝播待ち。assign は投げ直すと二重割り当てになるので固定で待つ。
			await new Promise((x) => setTimeout(x, 2));

			const assign = await api(
				'admin/roles/assign',
				{
					userId: alice.id,
					roleId: res.body.id,
				},
				root,
			);

			expect(assign.status).toBe(204);

			// ロール割り当ての伝播待ち。成功する呼び出しはノートを作るので、投げ直さず固定で待つ。
			await new Promise((x) => setTimeout(x, 2));

			const note = await api(
				'notes/create',
				{
					text: '@bob potentially annoying text',
					visibility: 'specified',
					visibleUserIds: [bob.id],
				},
				alice,
			);

			expect(note.status).toBe(200);

			await api(
				'admin/roles/unassign',
				{
					userId: alice.id,
					roleId: res.body.id,
				},
				root,
			);

			await api(
				'admin/roles/delete',
				{
					roleId: res.body.id,
				},
				root,
			);
		});
	});

	describe('notes/delete', () => {
		test('delete a reply', async () => {
			const mainNoteRes = await api(
				'notes/create',
				{
					text: 'main post',
				},
				alice,
			);
			const replyOneRes = await api(
				'notes/create',
				{
					text: 'reply one',
					replyId: mainNoteRes.body.createdNote.id,
				},
				alice,
			);
			const replyTwoRes = await api(
				'notes/create',
				{
					text: 'reply two',
					replyId: mainNoteRes.body.createdNote.id,
				},
				alice,
			);

			const deleteOneRes = await api(
				'notes/delete',
				{
					noteId: replyOneRes.body.createdNote.id,
				},
				alice,
			);

			expect(deleteOneRes.status).toBe(204);
			let mainNote = await fetchNoteByIdFromDatabase(database, mainNoteRes.body.createdNote.id);
			assert.ok(mainNote);
			expect(mainNote.repliesCount).toBe(1);

			const deleteTwoRes = await api(
				'notes/delete',
				{
					noteId: replyTwoRes.body.createdNote.id,
				},
				alice,
			);

			expect(deleteTwoRes.status).toBe(204);
			mainNote = await fetchNoteByIdFromDatabase(database, mainNoteRes.body.createdNote.id);
			assert.ok(mainNote);
			expect(mainNote.repliesCount).toBe(0);
		});
	});

	describe('notes/translate', () => {
		describe('翻訳機能の利用が許可されていない場合', () => {
			let cannotTranslateRole: misskey.entities.Role;

			beforeAll(async () => {
				cannotTranslateRole = await role(
					root,
					{},
					{ canUseTranslator: { priority: 1, useDefault: false, value: false } },
				);
				await api('admin/roles/assign', { roleId: cannotTranslateRole.id, userId: alice.id }, root);
			});

			test('翻訳機能の利用が許可されていない場合翻訳できない', async () => {
				const aliceNote = await post(alice, { text: 'Hello' });
				const res = await api(
					'notes/translate',
					{
						noteId: aliceNote.id,
						targetLang: 'ja',
					},
					alice,
				);

				expect(res.status).toBe(400);
				assert.ok(res.body);
				expect(castAsError(res.body).error.code).toBe('UNAVAILABLE');
			});

			afterAll(async () => {
				await api('admin/roles/unassign', { roleId: cannotTranslateRole.id, userId: alice.id }, root);
			});
		});

		test('存在しないノートは翻訳できない', async () => {
			const res = await api('notes/translate', { noteId: 'foo', targetLang: 'ja' }, alice);

			expect(res.status).toBe(400);
			assert.ok(res.body);
			expect(castAsError(res.body).error.code).toBe('NO_SUCH_NOTE');
		});

		test('不可視なノートは翻訳できない', async () => {
			const aliceNote = await post(alice, { visibility: 'followers', text: 'Hello' });
			const bobTranslateAttempt = await api('notes/translate', { noteId: aliceNote.id, targetLang: 'ja' }, bob);

			expect(bobTranslateAttempt.status).toBe(400);
			assert.ok(bobTranslateAttempt.body);
			expect(castAsError(bobTranslateAttempt.body).error.code).toBe('CANNOT_TRANSLATE_INVISIBLE_NOTE');
		});

		test('text: null なノートを翻訳すると空のレスポンスが返ってくる', async () => {
			const aliceNote = await post(alice, { text: null, poll: { choices: ['kinoko', 'takenoko'] } });
			const res = await api('notes/translate', { noteId: aliceNote.id, targetLang: 'ja' }, alice);

			expect(res.status).toBe(204);
		});

		test('サーバーに DeepL 認証キーが登録されていない場合翻訳できない', async () => {
			const aliceNote = await post(alice, { text: 'Hello' });
			const res = await api('notes/translate', { noteId: aliceNote.id, targetLang: 'ja' }, alice);

			// NOTE: デフォルトでは登録されていないので落ちる
			expect(res.status).toBe(400);
			assert.ok(res.body);
			expect(castAsError(res.body).error.code).toBe('UNAVAILABLE');
		});
	});

	describe('notes/drafts', () => {
		test('下書きの作成、更新、一覧、件数、削除ができる', async () => {
			const beforeCount = await api('notes/drafts/count', {}, alice);
			expect(beforeCount.status).toBe(200);

			const createRes = await api(
				'notes/drafts/create',
				{
					text: 'draft body',
				},
				alice,
			);
			expect(createRes.status).toBe(200);
			expect(createRes.body.createdDraft.text).toBe('draft body');

			const draftId = createRes.body.createdDraft.id;

			const countAfterCreate = await api('notes/drafts/count', {}, alice);
			expect(countAfterCreate.status).toBe(200);
			expect(countAfterCreate.body).toBe(beforeCount.body + 1);

			const listRes = await api(
				'notes/drafts/list',
				{
					limit: 10,
					scheduled: false,
				},
				alice,
			);
			expect(listRes.status).toBe(200);
			assert.ok(listRes.body.some((draft) => draft.id === draftId && draft.text === 'draft body'));

			const updateRes = await api(
				'notes/drafts/update',
				{
					draftId,
					text: 'updated draft body',
				},
				alice,
			);
			expect(updateRes.status).toBe(200);
			expect(updateRes.body.updatedDraft.id).toBe(draftId);
			expect(updateRes.body.updatedDraft.text).toBe('updated draft body');

			const deleteRes = await api(
				'notes/drafts/delete',
				{
					draftId,
				},
				alice,
			);
			expect(deleteRes.status).toBe(204);

			const countAfterDelete = await api('notes/drafts/count', {}, alice);
			expect(countAfterDelete.status).toBe(200);
			expect(countAfterDelete.body).toBe(beforeCount.body);
		});
	});
});
