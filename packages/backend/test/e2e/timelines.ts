/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 実行方法:
// bun run test:e2e -- e2e/timelines.ts

import * as assert from 'assert';
import { beforeAll, describe, expect, test } from 'vitest';
import { entities } from 'misskey-js';
import { Redis } from 'ioredis';
import { SignupResponse, Note } from 'misskey-js/entities.js';
import { fixtureConfig } from '../fixtures.js';
import { api, initTestDb, post, randomString, sendEnvUpdateRequest, signup, uploadFile, UserToken } from '../utils.js';

function genHost() {
	return randomString() + '.example.com';
}

let redisForTimelines: Redis;
let root: SignupResponse;

async function renote(noteId: string, user: UserToken): Promise<entities.Note> {
	return await api('notes/create', { renoteId: noteId }, user).then((it) => it.body.createdNote);
}

async function createChannel(name: string, user: UserToken): Promise<entities.ChannelsCreateResponse> {
	return (await api('channels/create', { name }, user)).body;
}

async function followChannel(channelId: string, user: UserToken) {
	return await api('channels/follow', { channelId }, user);
}

async function muteChannel(channelId: string, user: UserToken) {
	await api('channels/mute/create', { channelId }, user);
}

async function uploadTimelineFile(user: UserToken): Promise<entities.DriveFile> {
	const res = await uploadFile(user, { path: '192.png' });
	expect(res.status).toBe(200);
	assert.ok(res.body);
	return res.body;
}

async function createList(name: string, user: UserToken): Promise<entities.UsersListsCreateResponse> {
	return (await api('users/lists/create', { name }, user)).body;
}

async function pushList(listId: string, pushUserIds: string[] = [], user: UserToken) {
	for (const userId of pushUserIds) {
		await api('users/lists/push', { listId, userId }, user);
	}
}

async function createRole(name: string, user: UserToken): Promise<entities.AdminRolesCreateResponse> {
	return (
		await api(
			'admin/roles/create',
			{
				name,
				description: '',
				color: '#000000',
				iconUrl: '',
				target: 'manual',
				condFormula: {},
				isPublic: true,
				isModerator: false,
				isAdministrator: false,
				isExplorable: true,
				asBadge: false,
				canEditMembersByModerator: false,
				displayOrder: 0,
				policies: {},
			},
			user,
		)
	).body;
}

async function assignRole(roleId: string, userId: string, user: UserToken) {
	await api('admin/roles/assign', { userId, roleId }, user);
}

describe('Timelines', () => {
	let root: UserToken;

	beforeAll(
		async () => {
			redisForTimelines = new Redis(fixtureConfig.valkey.timelines);
			root = await signup({ username: 'root' });
		},
		1000 * 60 * 2,
	);

	// afterEach(async () => {
	// 	// テスト中に作ったノートをきれいにする。
	// 	// ユーザも作っているが、時間差で動く通知系処理などがあり、このタイミングで消すとエラー落ちするので消さない（ノートさえ消えていれば支障はない）
	// 	const db = await initTestDb(true);
	// 	await db.query('DELETE FROM "note"');
	// 	await db.query('DELETE FROM "channel"');
	// });

	describe.each([{ enableFanoutTimeline: true }, { enableFanoutTimeline: false }])(
		'Timelines (enableFanoutTimeline: $enableFanoutTimeline)',
		({ enableFanoutTimeline }) => {
			beforeAll(
				async () => {
					await api('admin/update-meta', { enableFanoutTimeline }, root);
				},
				1000 * 60 * 2,
			);

			describe('Home TL', () => {
				test('自分の visibility: followers なノートが含まれる', async () => {
					const [alice] = await Promise.all([signup()]);

					const aliceNote = await post(alice, { text: 'hi', visibility: 'followers' });

					const res = await api('notes/timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === aliceNote.id)).toBe(true);
					expect(res.body.find((note) => note.id === aliceNote.id)?.text).toBe('hi');
				});

				test('フォローしているユーザーのノートが含まれる', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					await api('following/create', { userId: bob.id }, alice);
					const bobNote = await post(bob, { text: 'hi' });
					const carolNote = await post(carol, { text: 'hi' });

					const res = await api('notes/timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
					expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
				});

				test('フォローしているユーザーの visibility: followers なノートが含まれる', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					await api('following/create', { userId: bob.id }, alice);
					const bobNote = await post(bob, { text: 'hi', visibility: 'followers' });
					const carolNote = await post(carol, { text: 'hi' });

					const res = await api('notes/timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
					expect(res.body.find((note) => note.id === bobNote.id)?.text).toBe('hi');
					expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
				});

				test('withReplies: false でフォローしているユーザーの他人への返信が含まれない', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					await api('following/create', { userId: bob.id }, alice);
					const carolNote = await post(carol, { text: 'hi' });
					const bobNote = await post(bob, { text: 'hi', replyId: carolNote.id });

					const res = await api('notes/timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
					expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
				});

				// FIXME: https://github.com/misskey-dev/misskey/issues/12065
				test.skipIf(!enableFanoutTimeline)(
					'withReplies: true でフォローしているユーザーの他人への返信が含まれる',
					async () => {
						const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

						await api('following/create', { userId: bob.id }, alice);
						await api('following/update', { userId: bob.id, withReplies: true }, alice);
						const carolNote = await post(carol, { text: 'hi' });
						const bobNote = await post(bob, { text: 'hi', replyId: carolNote.id });

						const res = await api('notes/timeline', { limit: 100 }, alice);

						expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
					},
				);

				test('withReplies: true でフォローしているユーザーの他人へのDM返信が含まれない', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					await api('following/create', { userId: bob.id }, alice);
					await api('following/update', { userId: bob.id, withReplies: true }, alice);
					const carolNote = await post(carol, { text: 'hi' });
					const bobNote = await post(bob, {
						text: 'hi',
						replyId: carolNote.id,
						visibility: 'specified',
						visibleUserIds: [carolNote.id],
					});

					const res = await api('notes/timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
					expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
				});

				test('withReplies: true でフォローしているユーザーの他人の visibility: followers な投稿への返信が含まれない', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					await api('following/create', { userId: carol.id }, bob);
					await api('following/create', { userId: bob.id }, alice);
					await api('following/update', { userId: bob.id, withReplies: true }, alice);
					const carolNote = await post(carol, { text: 'hi', visibility: 'followers' });
					const bobNote = await post(bob, { text: 'hi', replyId: carolNote.id });

					const res = await api('notes/timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
					expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
				});

				// FIXME: https://github.com/misskey-dev/misskey/issues/12065
				test.skipIf(!enableFanoutTimeline)(
					'withReplies: true でフォローしているユーザーの行った別のフォローしているユーザーの visibility: followers な投稿への返信が含まれる',
					async () => {
						const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

						await api('following/create', { userId: bob.id }, alice);
						await api('following/create', { userId: carol.id }, alice);
						await api('following/create', { userId: carol.id }, bob);
						await api('following/update', { userId: bob.id, withReplies: true }, alice);
						const carolNote = await post(carol, { text: 'hi', visibility: 'followers' });
						const bobNote = await post(bob, { text: 'hi', replyId: carolNote.id });

						const res = await api('notes/timeline', { limit: 100 }, alice);

						expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === carolNote.id)).toBe(true);
						expect(res.body.find((note) => note.id === carolNote.id)?.text).toBe('hi');
					},
				);

				// FIXME: https://github.com/misskey-dev/misskey/issues/12065
				test.skipIf(!enableFanoutTimeline)(
					'withReplies: true でフォローしているユーザーの自分の visibility: followers な投稿への返信が含まれる',
					async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						await api('following/create', { userId: bob.id }, alice);
						await api('following/create', { userId: alice.id }, bob);
						await api('following/update', { userId: bob.id, withReplies: true }, alice);
						const aliceNote = await post(alice, { text: 'hi', visibility: 'followers' });
						const bobNote = await post(bob, { text: 'hi', replyId: aliceNote.id });

						const res = await api('notes/timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(true);
						expect(res.body.some((note: any) => note.id === aliceNote.id)).toBe(true);
					},
				);

				test('withReplies: true でフォローしているユーザーの行った別のフォローしているユーザーの投稿への visibility: specified な返信が含まれない', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					await api('following/create', { userId: bob.id }, alice);
					await api('following/create', { userId: carol.id }, alice);
					await api('following/update', { userId: bob.id, withReplies: true }, alice);
					const carolNote = await post(carol, { text: 'hi' });
					const bobNote = await post(bob, {
						text: 'hi',
						replyId: carolNote.id,
						visibility: 'specified',
						visibleUserIds: [carolNote.id],
					});

					const res = await api('notes/timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
					expect(res.body.some((note) => note.id === carolNote.id)).toBe(true);
				});

				test('withReplies: false でフォローしているユーザーのそのユーザー自身への返信が含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					await api('following/create', { userId: bob.id }, alice);
					const bobNote1 = await post(bob, { text: 'hi' });
					const bobNote2 = await post(bob, { text: 'hi', replyId: bobNote1.id });

					const res = await api('notes/timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote1.id)).toBe(true);
					expect(res.body.some((note) => note.id === bobNote2.id)).toBe(true);
				});

				// FIXME: https://github.com/misskey-dev/misskey/issues/12065
				test.skipIf(!enableFanoutTimeline)(
					'withReplies: false でフォローしているユーザーからの自分への返信が含まれる',
					async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						await api('following/create', { userId: bob.id }, alice);
						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'hi', replyId: aliceNote.id });

						const res = await api('notes/timeline', { limit: 100 }, alice);

						expect(res.body.some((note) => note.id === aliceNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
					},
				);

				// FIXME: https://github.com/misskey-dev/misskey/issues/12065
				test.skipIf(!enableFanoutTimeline)('自分の他人への返信が含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const bobNote = await post(bob, { text: 'hi' });
					const aliceNote = await post(alice, { text: 'hi', replyId: bobNote.id });

					const res = await api('notes/timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
					expect(res.body.some((note) => note.id === aliceNote.id)).toBe(true);
				});

				test('フォローしているユーザーの他人の投稿のリノートが含まれる', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					await api('following/create', { userId: bob.id }, alice);
					const carolNote = await post(carol, { text: 'hi' });
					const bobNote = await post(bob, { renoteId: carolNote.id });

					const res = await api('notes/timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
					expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
				});

				test('[withRenotes: false] フォローしているユーザーの投稿が含まれる', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					await api('following/create', { userId: bob.id }, alice);
					const bobNote = await post(bob, { text: 'hi' });
					const carolNote = await post(carol, { text: 'hi' });

					const res = await api(
						'notes/timeline',
						{
							limit: 100,
							withRenotes: false,
						},
						alice,
					);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
					expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
				});

				test('[withRenotes: false] フォローしているユーザーのファイルのみの投稿が含まれる', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					await api('following/create', { userId: bob.id }, alice);
					const [bobFile, carolFile] = await Promise.all([uploadTimelineFile(bob), uploadTimelineFile(carol)]);
					const bobNote = await post(bob, { fileIds: [bobFile.id] });
					const carolNote = await post(carol, { fileIds: [carolFile.id] });

					const res = await api(
						'notes/timeline',
						{
							limit: 100,
							withRenotes: false,
						},
						alice,
					);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
					expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
				});

				test('[withRenotes: false] フォローしているユーザーの他人の投稿のリノートが含まれない', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					await api('following/create', { userId: bob.id }, alice);
					const carolNote = await post(carol, { text: 'hi' });
					const bobNote = await post(bob, { renoteId: carolNote.id });

					const res = await api(
						'notes/timeline',
						{
							withRenotes: false,
						},
						alice,
					);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
					expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
				});

				test('[withRenotes: false] フォローしているユーザーの他人の投稿の引用が含まれる', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					await api('following/create', { userId: bob.id }, alice);
					const carolNote = await post(carol, { text: 'hi' });
					const bobNote = await post(bob, { text: 'hi', renoteId: carolNote.id });

					const res = await api(
						'notes/timeline',
						{
							withRenotes: false,
						},
						alice,
					);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
					expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
				});

				test('フォローしているユーザーの他人への visibility: specified なノートが含まれない', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					await api('following/create', { userId: bob.id }, alice);
					const bobNote = await post(bob, { text: 'hi', visibility: 'specified', visibleUserIds: [carol.id] });

					const res = await api('notes/timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
				});

				test('フォローしているユーザーが行ったミュートしているユーザーのリノートが含まれない', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					await api('following/create', { userId: bob.id }, alice);
					await api('mute/create', { userId: carol.id }, alice);
					const carolNote = await post(carol, { text: 'hi' });
					const bobNote = await post(bob, { text: 'hi', renoteId: carolNote.id });

					const res = await api('notes/timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
					expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
				});

				test('withReplies: true でフォローしているユーザーが行ったミュートしているユーザーの投稿への返信が含まれない', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					await api('following/create', { userId: bob.id }, alice);
					await api('following/update', { userId: bob.id, withReplies: true }, alice);
					await api('mute/create', { userId: carol.id }, alice);
					const carolNote = await post(carol, { text: 'hi' });
					const bobNote = await post(bob, { text: 'hi', replyId: carolNote.id });

					const res = await api('notes/timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
					expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
				});

				test('ミュートしているユーザーのノートの、関係のないユーザによる引用ノートの、フォローしているユーザーによるリノートが含まれない', async () => {
					const [alice, bob, carol, dave] = await Promise.all([signup(), signup(), signup(), signup()]);

					await api('following/create', { userId: bob.id }, alice);
					await api('mute/create', { userId: carol.id }, alice);
					const carolNote = await post(carol, { text: 'hi' });
					const daveNote = await post(dave, { text: 'quote hi', renoteId: carolNote.id });
					const bobNote = await post(bob, { renoteId: daveNote.id });

					const res = await api('notes/timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
					expect(res.body.some((note) => note.id === daveNote.id)).toBe(false);
					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
				});

				test('ミュートしているユーザーのノートの、関係のないユーザによるリプライの、フォローしているユーザーによるリノートが含まれない', async () => {
					const [alice, bob, carol, dave] = await Promise.all([signup(), signup(), signup(), signup()]);

					await api('following/create', { userId: bob.id }, alice);
					await api('mute/create', { userId: carol.id }, alice);
					const carolNote = await post(carol, { text: 'hi' });
					const daveNote = await post(dave, { text: 'quote hi', replyId: carolNote.id });
					const bobNote = await post(bob, { renoteId: daveNote.id });

					const res = await api('notes/timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
					expect(res.body.some((note) => note.id === daveNote.id)).toBe(false);
					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
				});

				test('フォローしているリモートユーザーのノートが含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup({ host: genHost() })]);

					await sendEnvUpdateRequest({ key: 'FORCE_FOLLOW_REMOTE_USER_FOR_TESTING', value: 'true' });
					await api('following/create', { userId: bob.id }, alice);

					const bobNote = await post(bob, { text: 'hi' });

					const res = await api('notes/timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
				});

				test('フォローしているリモートユーザーの visibility: home なノートが含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup({ host: genHost() })]);

					await sendEnvUpdateRequest({ key: 'FORCE_FOLLOW_REMOTE_USER_FOR_TESTING', value: 'true' });
					await api('following/create', { userId: bob.id }, alice);

					const bobNote = await post(bob, { text: 'hi', visibility: 'home' });

					const res = await api('notes/timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
				});

				test(
					'[withFiles: true] フォローしているユーザーのファイル付きノートのみ含まれる',
					async () => {
						const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

						await api('following/create', { userId: bob.id }, alice);
						const [bobFile, carolFile] = await Promise.all([uploadTimelineFile(bob), uploadTimelineFile(carol)]);
						const bobNote1 = await post(bob, { text: 'hi' });
						const bobNote2 = await post(bob, { fileIds: [bobFile.id] });
						const carolNote1 = await post(carol, { text: 'hi' });
						const carolNote2 = await post(carol, { fileIds: [carolFile.id] });

						const res = await api('notes/timeline', { limit: 100, withFiles: true }, alice);

						expect(res.body.some((note) => note.id === bobNote1.id)).toBe(false);
						expect(res.body.some((note) => note.id === bobNote2.id)).toBe(true);
						expect(res.body.some((note) => note.id === carolNote1.id)).toBe(false);
						expect(res.body.some((note) => note.id === carolNote2.id)).toBe(false);
					},
					1000 * 30,
				);

				test('フォローしているユーザーのチャンネル投稿が含まれない', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const channel = await api('channels/create', { name: 'channel' }, bob).then((x) => x.body);
					await api('following/create', { userId: bob.id }, alice);
					const bobNote = await post(bob, { text: 'hi', channelId: channel.id });

					const res = await api('notes/timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
				});

				test('自分の visibility: specified なノートが含まれる', async () => {
					const [alice] = await Promise.all([signup()]);

					const aliceNote = await post(alice, { text: 'hi', visibility: 'specified' });

					const res = await api('notes/timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === aliceNote.id)).toBe(true);
					expect(res.body.find((note) => note.id === aliceNote.id)?.text).toBe('hi');
				});

				test('フォローしているユーザーの自身を visibleUserIds に指定した visibility: specified なノートが含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					await api('following/create', { userId: bob.id }, alice);
					const bobNote = await post(bob, { text: 'hi', visibility: 'specified', visibleUserIds: [alice.id] });

					const res = await api('notes/timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
					expect(res.body.find((note) => note.id === bobNote.id)?.text).toBe('hi');
				});

				test('フォローしていないユーザーの自身を visibleUserIds に指定した visibility: specified なノートが含まれない', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const bobNote = await post(bob, { text: 'hi', visibility: 'specified', visibleUserIds: [alice.id] });

					const res = await api('notes/timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
				});

				test('フォローしているユーザーの自身を visibleUserIds に指定していない visibility: specified なノートが含まれない', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					await api('following/create', { userId: bob.id }, alice);
					const bobNote = await post(bob, { text: 'hi', visibility: 'specified', visibleUserIds: [carol.id] });

					const res = await api('notes/timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
				});

				// FIXME: https://github.com/misskey-dev/misskey/issues/12065
				test.skipIf(!enableFanoutTimeline)(
					'フォローしていないユーザーからの visibility: specified なノートに返信したときの自身のノートが含まれる',
					async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const bobNote = await post(bob, { text: 'hi', visibility: 'specified', visibleUserIds: [alice.id] });
						const aliceNote = await post(alice, {
							text: 'ok',
							visibility: 'specified',
							visibleUserIds: [bob.id],
							replyId: bobNote.id,
						});

						const res = await api('notes/timeline', { limit: 100 }, alice);

						expect(res.body.some((note) => note.id === aliceNote.id)).toBe(true);
						expect(res.body.find((note) => note.id === aliceNote.id)?.text).toBe('ok');
					},
				);

				/* TODO
			test('自身の visibility: specified なノートへのフォローしていないユーザーからの返信が含まれる', async () => {
				const [alice, bob] = await Promise.all([signup(), signup()]);
				const aliceNote = await post(alice, { text: 'hi', visibility: 'specified', visibleUserIds: [bob.id] });
				const bobNote = await post(bob, { text: 'ok', visibility: 'specified', visibleUserIds: [alice.id], replyId: aliceNote.id });
				const res = await api('notes/timeline', { limit: 100 }, alice);
				expect(res.body.some(note => note.id === bobNote.id)).toBe(true);
				expect(res.body.find(note => note.id === bobNote.id).text).toBe('ok');
			});
			*/

				// ↑の挙動が理想だけど実装が面倒かも
				test('自身の visibility: specified なノートへのフォローしていないユーザーからの返信が含まれない', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const aliceNote = await post(alice, { text: 'hi', visibility: 'specified', visibleUserIds: [bob.id] });
					const bobNote = await post(bob, {
						text: 'ok',
						visibility: 'specified',
						visibleUserIds: [alice.id],
						replyId: aliceNote.id,
					});

					const res = await api('notes/timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
				});

				describe('Channel', () => {
					test('チャンネル未フォロー　＋　ユーザ未フォロー　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('チャンネルフォロー　＋　ユーザ未フォロー　＝　TLに流れる', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(true);
					});

					test('チャンネル未フォロー　＋　ユーザフォロー　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);
						await api('following/create', { userId: bob.id }, alice);

						const channel = await createChannel('channel', bob);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('チャンネルフォロー　＋　ユーザフォロー　＝　TLに流れる', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);
						await api('following/create', { userId: bob.id }, alice);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(true);
					});

					test('チャンネル未フォロー　＋　ユーザ未フォロー　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('チャンネルフォロー　＋　ユーザ未フォロー　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('チャンネル未フォロー　＋　ユーザフォロー　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);
						await api('following/create', { userId: bob.id }, alice);

						const channel = await createChannel('channel', bob);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('チャンネルフォロー　＋　ユーザフォロー　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);
						await api('following/create', { userId: bob.id }, alice);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('[チャンネル外リノート] チャンネル未フォロー　＋　ユーザ未フォロー　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(false);
					});

					test('[チャンネル外リノート] チャンネルフォロー　＋　ユーザ未フォロー　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(false);
					});

					test('[チャンネル外リノート] チャンネル未フォロー　＋　ユーザフォロー　＝　TLに流れる', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);
						await api('following/create', { userId: bob.id }, alice);

						const channel = await createChannel('channel', bob);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(true);
					});

					test('[チャンネル外リノート] チャンネルフォロー　＋　ユーザフォロー　＝　TLに流れる', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);
						await api('following/create', { userId: bob.id }, alice);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(true);
					});

					test('[チャンネル外リノート] チャンネル未フォロー　＋　ユーザ未フォロー　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(false);
					});

					test('[チャンネル外リノート] チャンネルフォロー　＋　ユーザ未フォロー　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(false);
					});

					test('[チャンネル外リノート] チャンネル未フォロー　＋　ユーザフォロー　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);
						await api('following/create', { userId: bob.id }, alice);

						const channel = await createChannel('channel', bob);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(false);
					});

					test('[チャンネル外リノート] チャンネルフォロー　＋　ユーザフォロー　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);
						await api('following/create', { userId: bob.id }, alice);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(false);
					});
				});

				test('FTT: ローカルユーザーの HTL にはプッシュされる', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					await api(
						'following/create',
						{
							userId: alice.id,
						},
						bob,
					);

					const aliceNote = await post(alice, { text: "I'm Alice." });
					const bobNote = await post(bob, { text: "I'm Bob." });
					const carolNote = await post(carol, { text: "I'm Carol." });

					if (enableFanoutTimeline) {
						// NOTE: notes/timeline だと DB へのフォールバックが効くので Redis を直接見て確かめる
						expect(await redisForTimelines.exists(`list:homeTimeline:${bob.id}`)).toBe(1);

						const bobHTL = await redisForTimelines.lrange(`list:homeTimeline:${bob.id}`, 0, -1);
						expect(bobHTL.includes(aliceNote.id)).toBe(true);
						expect(bobHTL.includes(bobNote.id)).toBe(true);
						expect(bobHTL.includes(carolNote.id)).toBe(false);
					} else {
						expect(await redisForTimelines.exists(`list:homeTimeline:${bob.id}`)).toBe(0);
					}
				});

				test('FTT: リモートユーザーの HTL にはプッシュされない', async () => {
					const [alice, bob] = await Promise.all([signup(), signup({ host: genHost() })]);

					await api(
						'following/create',
						{
							userId: alice.id,
						},
						bob,
					);

					await post(alice, { text: "I'm Alice." });
					await post(bob, { text: "I'm Bob." });

					// NOTE: notes/timeline だと DB へのフォールバックが効くので Redis を直接見て確かめる
					expect(await redisForTimelines.exists(`list:homeTimeline:${bob.id}`)).toBe(0);
				});

				describe('凍結', () => {
					let alice: SignupResponse, bob: SignupResponse, carol: SignupResponse;
					let aliceNote: Note, bobNote: Note, carolNote: Note;

					beforeAll(async () => {
						[alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

						await api('following/create', { userId: bob.id }, alice);
						await api('following/create', { userId: carol.id }, alice);
						aliceNote = await post(alice, { text: 'hi' });
						bobNote = await post(bob, { text: 'yo' });
						carolNote = await post(carol, { text: "kon'nichiwa" });

						await api('admin/suspend-user', { userId: carol.id }, root);
					});

					test('凍結後に凍結されたユーザーのノートは見えなくなる', async () => {
						const res = await api('notes/timeline', { limit: 100 }, alice);
						expect(res.body.some((note) => note.id === aliceNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
					});

					test('凍結解除後に凍結されていたユーザーのノートは見えるようになる', async () => {
						await api('admin/unsuspend-user', { userId: carol.id }, root);

						const res = await api('notes/timeline', { limit: 100 }, alice);

						expect(res.body.some((note) => note.id === aliceNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === carolNote.id)).toBe(true);
						expect(res.body.find((note) => note.id === carolNote.id)?.text).toBe("kon'nichiwa");
					});
				});

				describe('凍結 (Renote)', () => {
					let alice: SignupResponse, bob: SignupResponse, carol: SignupResponse;
					let aliceNote: Note, bobNote: Note, carolNote: Note, bobRenote: Note, carolRenote: Note;

					beforeAll(async () => {
						[alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

						await api('following/create', { userId: bob.id }, alice);
						await api('following/create', { userId: carol.id }, alice);
						aliceNote = await post(alice, { text: 'hi' });
						bobNote = await post(bob, { text: 'yo' });
						carolNote = await post(carol, { text: "kon'nichiwa" });
						bobRenote = await post(bob, { renoteId: carolNote.id });
						carolRenote = await post(carol, { renoteId: bobNote.id });

						await api('admin/suspend-user', { userId: carol.id }, root);
					});

					test('凍結後に凍結されたユーザーに対するRenoteや凍結されたユーザーのRenoteが見えなくなる', async () => {
						const res = await api('notes/timeline', { limit: 100 }, alice);
						expect(res.body.some((note) => note.id === aliceNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
						expect(res.body.some((note) => note.id === bobRenote.id)).toBe(false);
						expect(res.body.some((note) => note.id === carolRenote.id)).toBe(false);
					});

					test('凍結解除後に凍結されていたユーザーに対するRenoteや凍結されたユーザーのRenoteが見えるようになる', async () => {
						await api('admin/unsuspend-user', { userId: carol.id }, root);

						const res = await api('notes/timeline', { limit: 100 }, alice);

						expect(res.body.some((note) => note.id === aliceNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === carolNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === bobRenote.id)).toBe(true);
						expect(res.body.some((note) => note.id === carolRenote.id)).toBe(true);
					});
				});

				describe('凍結(リモート)', () => {
					let alice: SignupResponse, bob: SignupResponse, carol: SignupResponse;
					let aliceNote: Note, bobNote: Note, carolNote: Note;

					beforeAll(async () => {
						[alice, bob, carol] = await Promise.all([
							signup(),
							signup({ host: genHost() }),
							signup({ host: genHost() }),
						]);

						await sendEnvUpdateRequest({ key: 'FORCE_FOLLOW_REMOTE_USER_FOR_TESTING', value: 'true' });
						await api('following/create', { userId: bob.id }, alice);
						await api('following/create', { userId: carol.id }, alice);
						aliceNote = await post(alice, { text: 'hi' });
						bobNote = await post(bob, { text: 'yo' });
						carolNote = await post(carol, { text: "kon'nichiwa" });

						await api('admin/suspend-user', { userId: carol.id }, root);
					});

					test('凍結後に凍結されたユーザーのノートは見えなくなる', async () => {
						const res = await api('notes/timeline', { limit: 100 }, alice);

						expect(res.body.some((note) => note.id === aliceNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
					});

					test('凍結解除後に凍結されていたユーザーのノートは見えるようになる', async () => {
						await api('admin/unsuspend-user', { userId: carol.id }, root);

						const res = await api('notes/timeline', { limit: 100 }, alice);

						expect(res.body.some((note) => note.id === aliceNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === carolNote.id)).toBe(true);
					});
				});
			});

			describe('Local TL', () => {
				test('visibility: home なノートが含まれない', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					const carolNote = await post(carol, { text: 'hi', visibility: 'home' });
					const bobNote = await post(bob, { text: 'hi' });

					const res = await api('notes/local-timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
					expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
				});

				test('他人の他人への返信が含まれない', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					const carolNote = await post(carol, { text: 'hi' });
					const bobNote = await post(bob, { text: 'hi', replyId: carolNote.id });

					const res = await api('notes/local-timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
					expect(res.body.some((note) => note.id === carolNote.id)).toBe(true);
				});

				test('他人のその人自身への返信が含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const bobNote1 = await post(bob, { text: 'hi' });
					const bobNote2 = await post(bob, { text: 'hi', replyId: bobNote1.id });

					const res = await api('notes/local-timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote1.id)).toBe(true);
					expect(res.body.some((note) => note.id === bobNote2.id)).toBe(true);
				});

				test('チャンネル投稿が含まれない', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const channel = await api('channels/create', { name: 'channel' }, bob).then((x) => x.body);
					const bobNote = await post(bob, { text: 'hi', channelId: channel.id });

					const res = await api('notes/local-timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
				});

				test('リモートユーザーのノートが含まれない', async () => {
					const [alice, bob] = await Promise.all([signup(), signup({ host: genHost() })]);

					const bobNote = await post(bob, { text: 'hi' });

					const res = await api('notes/local-timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
				});

				// 含まれても良いと思うけど実装が面倒なので含まれない
				test('フォローしているユーザーの visibility: home なノートが含まれない', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					await api('following/create', { userId: carol.id }, alice);
					const carolNote = await post(carol, { text: 'hi', visibility: 'home' });
					const bobNote = await post(bob, { text: 'hi' });

					const res = await api('notes/local-timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
					expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
				});

				test('ミュートしているユーザーのノートが含まれない', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					await api('mute/create', { userId: carol.id }, alice);
					const carolNote = await post(carol, { text: 'hi' });
					const bobNote = await post(bob, { text: 'hi' });

					const res = await api('notes/local-timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
					expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
				});

				test('フォローしているユーザーが行ったミュートしているユーザーのリノートが含まれない', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					await api('following/create', { userId: bob.id }, alice);
					await api('mute/create', { userId: carol.id }, alice);
					const carolNote = await post(carol, { text: 'hi' });
					const bobNote = await post(bob, { text: 'hi', renoteId: carolNote.id });

					const res = await api('notes/local-timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
					expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
				});

				test('withReplies: true でフォローしているユーザーが行ったミュートしているユーザーの投稿への返信が含まれない', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					await api('following/create', { userId: bob.id }, alice);
					await api('following/update', { userId: bob.id, withReplies: true }, alice);
					await api('mute/create', { userId: carol.id }, alice);
					const carolNote = await post(carol, { text: 'hi' });
					const bobNote = await post(bob, { text: 'hi', replyId: carolNote.id });

					const res = await api('notes/local-timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
					expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
				});

				test('ミュートしているユーザーのノートの、関係のないユーザによる引用ノートの、リノートが含まれない', async () => {
					const [alice, bob, carol, dave] = await Promise.all([signup(), signup(), signup(), signup()]);

					await api('mute/create', { userId: carol.id }, alice);
					const carolNote = await post(carol, { text: 'hi' });
					const daveNote = await post(dave, { text: 'quote hi', renoteId: carolNote.id });
					const bobNote = await post(bob, { renoteId: daveNote.id });

					const res = await api('notes/local-timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
					expect(res.body.some((note) => note.id === daveNote.id)).toBe(false);
					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
				});

				test('ミュートしているユーザーのノートの、関係のないユーザによるリプライの、リノートが含まれない', async () => {
					const [alice, bob, carol, dave] = await Promise.all([signup(), signup(), signup(), signup()]);

					await api('mute/create', { userId: carol.id }, alice);
					const carolNote = await post(carol, { text: 'hi' });
					const daveNote = await post(dave, { text: 'quote hi', replyId: carolNote.id });
					const bobNote = await post(bob, { renoteId: daveNote.id });

					const res = await api('notes/local-timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
					expect(res.body.some((note) => note.id === daveNote.id)).toBe(false);
					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
				});

				// FIXME: https://github.com/misskey-dev/misskey/issues/12065
				test.skipIf(!enableFanoutTimeline)(
					'withReplies: false でフォローしているユーザーからの自分への返信が含まれる',
					async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						await api('following/create', { userId: bob.id }, alice);
						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'hi', replyId: aliceNote.id });

						const res = await api('notes/local-timeline', { limit: 100 }, alice);

						expect(res.body.some((note) => note.id === aliceNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
					},
				);

				// FIXME: https://github.com/misskey-dev/misskey/issues/12065
				test.skipIf(!enableFanoutTimeline)(
					'withReplies: false でフォローしていないユーザーからの自分への返信が含まれる',
					async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'hi', replyId: aliceNote.id });

						const res = await api('notes/local-timeline', { limit: 100 }, alice);

						expect(res.body.some((note) => note.id === aliceNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
					},
				);

				test('[withReplies: true] 他人の他人への返信が含まれる', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					const carolNote = await post(carol, { text: 'hi' });
					const bobNote = await post(bob, { text: 'hi', replyId: carolNote.id });

					const res = await api('notes/local-timeline', { limit: 100, withReplies: true }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
				});

				test(
					'[withFiles: true] ファイル付きノートのみ含まれる',
					async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const file = await uploadTimelineFile(bob);
						const bobNote1 = await post(bob, { text: 'hi' });
						const bobNote2 = await post(bob, { fileIds: [file.id] });

						const res = await api('notes/local-timeline', { limit: 100, withFiles: true }, alice);

						expect(res.body.some((note) => note.id === bobNote1.id)).toBe(false);
						expect(res.body.some((note) => note.id === bobNote2.id)).toBe(true);
					},
					1000 * 10,
				);

				describe('Channel', () => {
					test('チャンネル未フォロー　＋　ユーザ未フォロー　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/local-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('チャンネルフォロー　＋　ユーザ未フォロー　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/local-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('チャンネル未フォロー　＋　ユーザフォロー　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);
						await api('following/create', { userId: bob.id }, alice);

						const channel = await createChannel('channel', bob);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/local-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('チャンネルフォロー　＋　ユーザフォロー　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);
						await api('following/create', { userId: bob.id }, alice);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/local-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('チャンネル未フォロー　＋　ユーザ未フォロー　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/local-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('チャンネルフォロー　＋　ユーザ未フォロー　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/local-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('チャンネル未フォロー　＋　ユーザフォロー　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);
						await api('following/create', { userId: bob.id }, alice);

						const channel = await createChannel('channel', bob);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/local-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('チャンネルフォロー　＋　ユーザフォロー　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);
						await api('following/create', { userId: bob.id }, alice);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/local-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('[チャンネル外リノート] チャンネル未フォロー　＋　ユーザ未フォロー　＝　TLに流れる', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/local-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(true);
					});

					test('[チャンネル外リノート] チャンネルフォロー　＋　ユーザ未フォロー　＝　TLに流れる', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/local-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(true);
					});

					test('[チャンネル外リノート] チャンネル未フォロー　＋　ユーザフォロー　＝　TLに流れる', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);
						await api('following/create', { userId: bob.id }, alice);

						const channel = await createChannel('channel', bob);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/local-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(true);
					});

					test('[チャンネル外リノート] チャンネルフォロー　＋　ユーザフォロー　＝　TLに流れる', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);
						await api('following/create', { userId: bob.id }, alice);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/local-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(true);
					});

					test('[チャンネル外リノート] チャンネル未フォロー　＋　ユーザ未フォロー　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/local-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(false);
					});

					test('[チャンネル外リノート] チャンネルフォロー　＋　ユーザ未フォロー　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/local-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(false);
					});

					test('[チャンネル外リノート] チャンネル未フォロー　＋　ユーザフォロー　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);
						await api('following/create', { userId: bob.id }, alice);

						const channel = await createChannel('channel', bob);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/local-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(false);
					});

					test('[チャンネル外リノート] チャンネルフォロー　＋　ユーザフォロー　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);
						await api('following/create', { userId: bob.id }, alice);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/local-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(false);
					});
				});
			});

			describe('Social TL', () => {
				test('ローカルユーザーのノートが含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const bobNote = await post(bob, { text: 'hi' });

					const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
				});

				test('ローカルユーザーの visibility: home なノートが含まれない', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const bobNote = await post(bob, { text: 'hi', visibility: 'home' });

					const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
				});

				test('フォローしているローカルユーザーの visibility: home なノートが含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					await api('following/create', { userId: bob.id }, alice);
					const bobNote = await post(bob, { text: 'hi', visibility: 'home' });

					const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
				});

				// FIXME: https://github.com/misskey-dev/misskey/issues/12065
				test.skipIf(!enableFanoutTimeline)(
					'withReplies: false でフォローしているユーザーからの自分への返信が含まれる',
					async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						await api('following/create', { userId: bob.id }, alice);
						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'hi', replyId: aliceNote.id });

						const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

						expect(res.body.some((note) => note.id === aliceNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
					},
				);

				test('withReplies: true でフォローしているユーザーの他人の visibility: followers な投稿への返信が含まれない', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					await api('following/create', { userId: carol.id }, bob);
					await api('following/create', { userId: bob.id }, alice);
					await api('following/update', { userId: bob.id, withReplies: true }, alice);
					const carolNote = await post(carol, { text: 'hi', visibility: 'followers' });
					const bobNote = await post(bob, { text: 'hi', replyId: carolNote.id });

					const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

					expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					expect(res.body.some((note: any) => note.id === carolNote.id)).toBe(false);
				});

				// FIXME: https://github.com/misskey-dev/misskey/issues/12065
				test.skipIf(!enableFanoutTimeline)(
					'withReplies: true でフォローしているユーザーの行った別のフォローしているユーザーの visibility: followers な投稿への返信が含まれる',
					async () => {
						const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

						await api('following/create', { userId: bob.id }, alice);
						await api('following/create', { userId: carol.id }, alice);
						await api('following/create', { userId: carol.id }, bob);
						await api('following/update', { userId: bob.id, withReplies: true }, alice);
						const carolNote = await post(carol, { text: 'hi', visibility: 'followers' });
						const bobNote = await post(bob, { text: 'hi', replyId: carolNote.id });

						const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(true);
						expect(res.body.some((note: any) => note.id === carolNote.id)).toBe(true);
						expect(res.body.find((note: any) => note.id === carolNote.id)?.text).toBe('hi');
					},
				);

				// FIXME: https://github.com/misskey-dev/misskey/issues/12065
				test.skipIf(!enableFanoutTimeline)(
					'withReplies: true でフォローしているユーザーの自分の visibility: followers な投稿への返信が含まれる',
					async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						await api('following/create', { userId: bob.id }, alice);
						await api('following/create', { userId: alice.id }, bob);
						await api('following/update', { userId: bob.id, withReplies: true }, alice);
						const aliceNote = await post(alice, { text: 'hi', visibility: 'followers' });
						const bobNote = await post(bob, { text: 'hi', replyId: aliceNote.id });

						const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(true);
						expect(res.body.some((note: any) => note.id === aliceNote.id)).toBe(true);
					},
				);

				test('他人の他人への返信が含まれない', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					const carolNote = await post(carol, { text: 'hi' });
					const bobNote = await post(bob, { text: 'hi', replyId: carolNote.id });

					const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
					expect(res.body.some((note) => note.id === carolNote.id)).toBe(true);
				});

				test('リモートユーザーのノートが含まれない', async () => {
					const [alice, bob] = await Promise.all([signup(), signup({ host: genHost() })]);

					const bobNote = await post(bob, { text: 'hi' });

					const res = await api('notes/local-timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
				});

				test('フォローしているリモートユーザーのノートが含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup({ host: genHost() })]);

					await sendEnvUpdateRequest({ key: 'FORCE_FOLLOW_REMOTE_USER_FOR_TESTING', value: 'true' });
					await api('following/create', { userId: bob.id }, alice);

					const bobNote = await post(bob, { text: 'hi' });

					const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
				});

				test('フォローしているリモートユーザーの visibility: home なノートが含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup({ host: genHost() })]);

					await sendEnvUpdateRequest({ key: 'FORCE_FOLLOW_REMOTE_USER_FOR_TESTING', value: 'true' });
					await api('following/create', { userId: bob.id }, alice);

					const bobNote = await post(bob, { text: 'hi', visibility: 'home' });

					const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
				});

				// FIXME: https://github.com/misskey-dev/misskey/issues/12065
				test.skipIf(!enableFanoutTimeline)(
					'withReplies: false でフォローしていないユーザーからの自分への返信が含まれる',
					async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'hi', replyId: aliceNote.id });

						const res = await api('notes/local-timeline', { limit: 100 }, alice);

						expect(res.body.some((note) => note.id === aliceNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
					},
				);

				test('[withReplies: true] 他人の他人への返信が含まれる', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					const carolNote = await post(carol, { text: 'hi' });
					const bobNote = await post(bob, { text: 'hi', replyId: carolNote.id });

					const res = await api('notes/hybrid-timeline', { limit: 100, withReplies: true }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
				});

				test(
					'[withFiles: true] ファイル付きノートのみ含まれる',
					async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const file = await uploadTimelineFile(bob);
						const bobNote1 = await post(bob, { text: 'hi' });
						const bobNote2 = await post(bob, { fileIds: [file.id] });

						const res = await api('notes/hybrid-timeline', { limit: 100, withFiles: true }, alice);

						expect(res.body.some((note) => note.id === bobNote1.id)).toBe(false);
						expect(res.body.some((note) => note.id === bobNote2.id)).toBe(true);
					},
					1000 * 10,
				);

				describe('Channel', () => {
					test('チャンネル未フォロー　＋　ユーザ未フォロー　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('チャンネルフォロー　＋　ユーザ未フォロー　＝　TLに流れる', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(true);
					});

					test('チャンネル未フォロー　＋　ユーザフォロー　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);
						await api('following/create', { userId: bob.id }, alice);

						const channel = await createChannel('channel', bob);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('チャンネルフォロー　＋　ユーザフォロー　＝　TLに流れる', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);
						await api('following/create', { userId: bob.id }, alice);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(true);
					});

					test('チャンネル未フォロー　＋　ユーザ未フォロー　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('チャンネルフォロー　＋　ユーザ未フォロー　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('チャンネル未フォロー　＋　ユーザフォロー　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);
						await api('following/create', { userId: bob.id }, alice);

						const channel = await createChannel('channel', bob);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('チャンネルフォロー　＋　ユーザフォロー　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);
						await api('following/create', { userId: bob.id }, alice);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('[チャンネル外リノート] チャンネル未フォロー　＋　ユーザ未フォロー　＝　TLに流れる', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(true);
					});

					test('[チャンネル外リノート] チャンネルフォロー　＋　ユーザ未フォロー　＝　TLに流れる', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(true);
					});

					test('[チャンネル外リノート] チャンネル未フォロー　＋　ユーザフォロー　＝　TLに流れる', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);
						await api('following/create', { userId: bob.id }, alice);

						const channel = await createChannel('channel', bob);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(true);
					});

					test('[チャンネル外リノート] チャンネルフォロー　＋　ユーザフォロー　＝　TLに流れる', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);
						await api('following/create', { userId: bob.id }, alice);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(true);
					});

					test('[チャンネル外リノート] チャンネル未フォロー　＋　ユーザ未フォロー　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(false);
					});

					test('[チャンネル外リノート] チャンネルフォロー　＋　ユーザ未フォロー　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(false);
					});

					test('[チャンネル外リノート] チャンネル未フォロー　＋　ユーザフォロー　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);
						await api('following/create', { userId: bob.id }, alice);

						const channel = await createChannel('channel', bob);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(false);
					});

					test('[チャンネル外リノート] チャンネルフォロー　＋　ユーザフォロー　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);
						await api('following/create', { userId: bob.id }, alice);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(false);
					});
				});

				describe('凍結', () => {
					/*
					 * bob = 未フォローのローカルユーザー (凍結対象でない)
					 * carol = 未フォローのローカルユーザー (凍結対象)
					 * dave = フォローしているローカルユーザー (凍結対象)
					 */
					let alice: SignupResponse, bob: SignupResponse, carol: SignupResponse, dave: SignupResponse;
					let aliceNote: Note, bobNote: Note, carolNote: Note, daveNote: Note;

					beforeAll(async () => {
						[alice, bob, carol, dave] = await Promise.all([signup(), signup(), signup(), signup()]);

						await api('following/create', { userId: dave.id }, alice);
						aliceNote = await post(alice, { text: 'hi' });
						bobNote = await post(bob, { text: 'yo' });
						carolNote = await post(carol, { text: "kon'nichiwa" });
						daveNote = await post(dave, { text: 'hello' });

						await api('admin/suspend-user', { userId: carol.id }, root);
						await api('admin/suspend-user', { userId: dave.id }, root);
					});

					test('凍結後に凍結されたユーザーのノートは見えなくなる', async () => {
						const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

						expect(res.body.some((note) => note.id === aliceNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
						expect(res.body.some((note) => note.id === daveNote.id)).toBe(false);
					});

					test('凍結解除後に凍結されていたユーザーのノートは見えるようになる', async () => {
						await api('admin/unsuspend-user', { userId: carol.id }, root);
						await api('admin/unsuspend-user', { userId: dave.id }, root);

						const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

						expect(res.body.some((note) => note.id === aliceNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === carolNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === daveNote.id)).toBe(true);
					});
				});

				describe('凍結 (リモート)', () => {
					/*
					 * carol = 未フォローのリモートユーザー (凍結対象)
					 * elle = フォローしているリモートユーザー (凍結対象)
					 */
					let alice: SignupResponse, carol: SignupResponse, elle: SignupResponse;
					let aliceNote: Note, carolNote: Note, elleNote: Note;

					beforeAll(async () => {
						[alice, carol, elle] = await Promise.all([
							signup(),
							signup({ host: genHost() }),
							signup({ host: genHost() }),
						]);

						await sendEnvUpdateRequest({ key: 'FORCE_FOLLOW_REMOTE_USER_FOR_TESTING', value: 'true' });
						await api('following/create', { userId: elle.id }, alice);
						aliceNote = await post(alice, { text: 'hi' });
						carolNote = await post(carol, { text: "kon'nichiwa" });
						elleNote = await post(elle, { text: 'hi there' });

						await api('admin/suspend-user', { userId: carol.id }, root);
						await api('admin/suspend-user', { userId: elle.id }, root);
					});

					test('凍結後に凍結されたユーザーのノートは見えなくなる', async () => {
						const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

						expect(res.body.some((note) => note.id === aliceNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
						expect(res.body.some((note) => note.id === elleNote.id)).toBe(false);
					});

					test('凍結解除後に凍結されていたユーザーのノートは見えるようになる', async () => {
						await api('admin/unsuspend-user', { userId: carol.id }, root);
						await api('admin/unsuspend-user', { userId: elle.id }, root);

						const res = await api('notes/hybrid-timeline', { limit: 100 }, alice);

						expect(res.body.some((note) => note.id === aliceNote.id)).toBe(true);
						expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
						expect(res.body.some((note) => note.id === elleNote.id)).toBe(true);
					});
				});
			});

			describe('User List TL', () => {
				test('リスインしているフォローしていないユーザーのノートが含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const list = await api('users/lists/create', { name: 'list' }, alice).then((res) => res.body);
					await api('users/lists/push', { listId: list.id, userId: bob.id }, alice);
					const bobNote = await post(bob, { text: 'hi' });

					const res = await api('notes/user-list-timeline', { listId: list.id }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
				});

				test('リスインしているフォローしていないユーザーの visibility: home なノートが含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const list = await api('users/lists/create', { name: 'list' }, alice).then((res) => res.body);
					await api('users/lists/push', { listId: list.id, userId: bob.id }, alice);
					const bobNote = await post(bob, { text: 'hi', visibility: 'home' });

					const res = await api('notes/user-list-timeline', { listId: list.id }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
				});

				test('リスインしているフォローしていないユーザーの visibility: followers なノートが含まれない', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const list = await api('users/lists/create', { name: 'list' }, alice).then((res) => res.body);
					await api('users/lists/push', { listId: list.id, userId: bob.id }, alice);
					const bobNote = await post(bob, { text: 'hi', visibility: 'followers' });

					const res = await api('notes/user-list-timeline', { listId: list.id }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
				});

				test('リスインしているフォローしていないユーザーの他人への返信が含まれない', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					const list = await api('users/lists/create', { name: 'list' }, alice).then((res) => res.body);
					await api('users/lists/push', { listId: list.id, userId: bob.id }, alice);
					const carolNote = await post(carol, { text: 'hi' });
					const bobNote = await post(bob, { text: 'hi', replyId: carolNote.id });

					const res = await api('notes/user-list-timeline', { listId: list.id }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
				});

				test('リスインしているフォローしていないユーザーのユーザー自身への返信が含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const list = await api('users/lists/create', { name: 'list' }, alice).then((res) => res.body);
					await api('users/lists/push', { listId: list.id, userId: bob.id }, alice);
					const bobNote1 = await post(bob, { text: 'hi' });
					const bobNote2 = await post(bob, { text: 'hi', replyId: bobNote1.id });

					const res = await api('notes/user-list-timeline', { listId: list.id }, alice);

					expect(res.body.some((note) => note.id === bobNote1.id)).toBe(true);
					expect(res.body.some((note) => note.id === bobNote2.id)).toBe(true);
				});

				test('withReplies: false でリスインしているフォローしていないユーザーからの自分への返信が含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const list = await api('users/lists/create', { name: 'list' }, alice).then((res) => res.body);
					await api('users/lists/push', { listId: list.id, userId: bob.id }, alice);
					await api('users/lists/update-membership', { listId: list.id, userId: bob.id, withReplies: false }, alice);
					const aliceNote = await post(alice, { text: 'hi' });
					const bobNote = await post(bob, { text: 'hi', replyId: aliceNote.id });

					const res = await api('notes/user-list-timeline', { listId: list.id }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
				});

				test('withReplies: false でリスインしているフォローしていないユーザーの他人への返信が含まれない', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					const list = await api('users/lists/create', { name: 'list' }, alice).then((res) => res.body);
					await api('users/lists/push', { listId: list.id, userId: bob.id }, alice);
					await api('users/lists/update-membership', { listId: list.id, userId: bob.id, withReplies: false }, alice);
					const carolNote = await post(carol, { text: 'hi' });
					const bobNote = await post(bob, { text: 'hi', replyId: carolNote.id });

					const res = await api('notes/user-list-timeline', { listId: list.id }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
				});

				test('withReplies: true でリスインしているフォローしていないユーザーの他人への返信が含まれる', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					const list = await api('users/lists/create', { name: 'list' }, alice).then((res) => res.body);
					await api('users/lists/push', { listId: list.id, userId: bob.id }, alice);
					await api('users/lists/update-membership', { listId: list.id, userId: bob.id, withReplies: true }, alice);
					const carolNote = await post(carol, { text: 'hi' });
					const bobNote = await post(bob, { text: 'hi', replyId: carolNote.id });

					const res = await api('notes/user-list-timeline', { listId: list.id }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
				});

				test('リスインしているフォローしているユーザーの visibility: home なノートが含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					await api('following/create', { userId: bob.id }, alice);
					const list = await api('users/lists/create', { name: 'list' }, alice).then((res) => res.body);
					await api('users/lists/push', { listId: list.id, userId: bob.id }, alice);
					const bobNote = await post(bob, { text: 'hi', visibility: 'home' });

					const res = await api('notes/user-list-timeline', { listId: list.id }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
				});

				test('リスインしているフォローしているユーザーの visibility: followers なノートが含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					await api('following/create', { userId: bob.id }, alice);
					const list = await api('users/lists/create', { name: 'list' }, alice).then((res) => res.body);
					await api('users/lists/push', { listId: list.id, userId: bob.id }, alice);
					const bobNote = await post(bob, { text: 'hi', visibility: 'followers' });

					const res = await api('notes/user-list-timeline', { listId: list.id }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
					expect(res.body.find((note) => note.id === bobNote.id)?.text).toBe('hi');
				});

				test('リスインしている自分の visibility: followers なノートが含まれる', async () => {
					const [alice] = await Promise.all([signup(), signup()]);

					const list = await api('users/lists/create', { name: 'list' }, alice).then((res) => res.body);
					await api('users/lists/push', { listId: list.id, userId: alice.id }, alice);
					const aliceNote = await post(alice, { text: 'hi', visibility: 'followers' });

					const res = await api('notes/user-list-timeline', { listId: list.id }, alice);

					expect(res.body.some((note) => note.id === aliceNote.id)).toBe(true);
					expect(res.body.find((note) => note.id === aliceNote.id)?.text).toBe('hi');
				});

				test('リスインしているユーザーのチャンネルノートが含まれない', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const channel = await api('channels/create', { name: 'channel' }, bob).then((x) => x.body);
					const list = await api('users/lists/create', { name: 'list' }, alice).then((res) => res.body);
					await api('users/lists/push', { listId: list.id, userId: bob.id }, alice);
					const bobNote = await post(bob, { text: 'hi', channelId: channel.id });

					const res = await api('notes/user-list-timeline', { listId: list.id }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
				});

				test(
					'[withFiles: true] リスインしているユーザーのファイル付きノートのみ含まれる',
					async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const list = await api('users/lists/create', { name: 'list' }, alice).then((res) => res.body);
						await api('users/lists/push', { listId: list.id, userId: bob.id }, alice);
						const file = await uploadTimelineFile(bob);
						const bobNote1 = await post(bob, { text: 'hi' });
						const bobNote2 = await post(bob, { fileIds: [file.id] });

						const res = await api('notes/user-list-timeline', { listId: list.id, withFiles: true }, alice);

						expect(res.body.some((note) => note.id === bobNote1.id)).toBe(false);
						expect(res.body.some((note) => note.id === bobNote2.id)).toBe(true);
					},
					1000 * 10,
				);

				test('リスインしているユーザーの自身宛ての visibility: specified なノートが含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const list = await api('users/lists/create', { name: 'list' }, alice).then((res) => res.body);
					await api('users/lists/push', { listId: list.id, userId: bob.id }, alice);
					const bobNote = await post(bob, { text: 'hi', visibility: 'specified', visibleUserIds: [alice.id] });

					const res = await api('notes/user-list-timeline', { listId: list.id }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
					expect(res.body.find((note) => note.id === bobNote.id)?.text).toBe('hi');
				});

				test('リスインしているユーザーの自身宛てではない visibility: specified なノートが含まれない', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					const list = await api('users/lists/create', { name: 'list' }, alice).then((res) => res.body);
					await api('users/lists/push', { listId: list.id, userId: bob.id }, alice);
					await api('users/lists/push', { listId: list.id, userId: carol.id }, alice);
					const bobNote = await post(bob, { text: 'hi', visibility: 'specified', visibleUserIds: [carol.id] });

					const res = await api('notes/user-list-timeline', { listId: list.id }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
				});

				describe('Channel', () => {
					test('チャンネル未フォロー　＋　リスインしてない　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const list = await createList('list', alice);

						const channel = await createChannel('channel', bob);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/user-list-timeline', { limit: 100, listId: list.id }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('チャンネルフォロー　＋　リスインしてない　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const list = await createList('list', alice);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/user-list-timeline', { limit: 100, listId: list.id }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('チャンネル未フォロー　＋　リスインしてる　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const list = await createList('list', alice);
						await pushList(list.id, [bob.id], alice);

						const channel = await createChannel('channel', bob);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/user-list-timeline', { limit: 100, listId: list.id }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('チャンネルフォロー　＋　リスインしてる　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const list = await createList('list', alice);
						await pushList(list.id, [bob.id], alice);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/user-list-timeline', { limit: 100, listId: list.id }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('チャンネル未フォロー　＋　リスインしてない　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const list = await createList('list', alice);

						const channel = await createChannel('channel', bob);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/user-list-timeline', { limit: 100, listId: list.id }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('チャンネルフォロー　＋　リスインしてない　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const list = await createList('list', alice);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/user-list-timeline', { limit: 100, listId: list.id }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('チャンネル未フォロー　＋　リスインしてる　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const list = await createList('list', alice);
						await pushList(list.id, [bob.id], alice);

						const channel = await createChannel('channel', bob);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/user-list-timeline', { limit: 100, listId: list.id }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('チャンネルフォロー　＋　リスインしてる　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const list = await createList('list', alice);
						await pushList(list.id, [bob.id], alice);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('notes/user-list-timeline', { limit: 100, listId: list.id }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('[チャンネル外リノート] チャンネル未フォロー　＋　リスインしてない　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const list = await createList('list', alice);

						const channel = await createChannel('channel', bob);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/user-list-timeline', { limit: 100, listId: list.id }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(false);
					});

					test('[チャンネル外リノート] チャンネルフォロー　＋　リスインしてない　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const list = await createList('list', alice);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/user-list-timeline', { limit: 100, listId: list.id }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(false);
					});

					test('[チャンネル外リノート] チャンネル未フォロー　＋　リスインしてる　＝　TLに流れる', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const list = await createList('list', alice);
						await pushList(list.id, [bob.id], alice);

						const channel = await createChannel('channel', bob);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/user-list-timeline', { limit: 100, listId: list.id }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(true);
					});

					test('[チャンネル外リノート] チャンネルフォロー　＋　リスインしてる　＝　TLに流れる', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const list = await createList('list', alice);
						await pushList(list.id, [bob.id], alice);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/user-list-timeline', { limit: 100, listId: list.id }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(true);
					});

					test('[チャンネル外リノート] チャンネル未フォロー　＋　リスインしてない　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const list = await createList('list', alice);

						const channel = await createChannel('channel', bob);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/user-list-timeline', { limit: 100, listId: list.id }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(false);
					});

					test('[チャンネル外リノート] チャンネルフォロー　＋　リスインしてない　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const list = await createList('list', alice);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/user-list-timeline', { limit: 100, listId: list.id }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(false);
					});

					test('[チャンネル外リノート] チャンネル未フォロー　＋　リスインしてる　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const list = await createList('list', alice);
						await pushList(list.id, [bob.id], alice);

						const channel = await createChannel('channel', bob);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/user-list-timeline', { limit: 100, listId: list.id }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(false);
					});

					test('[チャンネル外リノート] チャンネルフォロー　＋　リスインしてる　＋　チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const list = await createList('list', alice);
						await pushList(list.id, [bob.id], alice);

						const channel = await createChannel('channel', bob);
						await followChannel(channel.id, alice);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('notes/user-list-timeline', { limit: 100, listId: list.id }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(false);
					});
				});
			});

			describe('User TL', () => {
				test('ノートが含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const bobNote = await post(bob, { text: 'hi' });

					const res = await api('users/notes', { userId: bob.id }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
				});

				test('フォローしていないユーザーの visibility: followers なノートが含まれない', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const bobNote = await post(bob, { text: 'hi', visibility: 'followers' });

					const res = await api('users/notes', { userId: bob.id }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
				});

				test('フォローしているユーザーの visibility: followers なノートが含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					await api('following/create', { userId: bob.id }, alice);
					const bobNote = await post(bob, { text: 'hi', visibility: 'followers' });

					const res = await api('users/notes', { userId: bob.id }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
					expect(res.body.find((note) => note.id === bobNote.id)?.text).toBe('hi');
				});

				test('自身の visibility: followers なノートが含まれる', async () => {
					const [alice] = await Promise.all([signup()]);

					const aliceNote = await post(alice, { text: 'hi', visibility: 'followers' });

					const res = await api('users/notes', { userId: alice.id }, alice);

					expect(res.body.some((note) => note.id === aliceNote.id)).toBe(true);
					expect(res.body.find((note) => note.id === aliceNote.id)?.text).toBe('hi');
				});

				test('チャンネル投稿が含まれない', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const channel = await api('channels/create', { name: 'channel' }, bob).then((x) => x.body);
					const bobNote = await post(bob, { text: 'hi', channelId: channel.id });

					const res = await api('users/notes', { userId: bob.id }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
				});

				// FIXME: https://github.com/misskey-dev/misskey/issues/12065
				test.skipIf(!enableFanoutTimeline)('[withReplies: false] 他人への返信が含まれない', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					const carolNote = await post(carol, { text: 'hi' });
					const bobNote1 = await post(bob, { text: 'hi' });
					const bobNote2 = await post(bob, { text: 'hi', replyId: carolNote.id });

					const res = await api('users/notes', { userId: bob.id }, alice);

					expect(res.body.some((note) => note.id === bobNote1.id)).toBe(true);
					expect(res.body.some((note) => note.id === bobNote2.id)).toBe(false);
				});

				test('[withReplies: true] 他人への返信が含まれる', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					const carolNote = await post(carol, { text: 'hi' });
					const bobNote1 = await post(bob, { text: 'hi' });
					const bobNote2 = await post(bob, { text: 'hi', replyId: carolNote.id });

					const res = await api('users/notes', { userId: bob.id, withReplies: true }, alice);

					expect(res.body.some((note) => note.id === bobNote1.id)).toBe(true);
					expect(res.body.some((note) => note.id === bobNote2.id)).toBe(true);
				});

				test('[withReplies: true] 他人への visibility: specified な返信が含まれない', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					const carolNote = await post(carol, { text: 'hi' });
					const bobNote1 = await post(bob, { text: 'hi' });
					const bobNote2 = await post(bob, { text: 'hi', replyId: carolNote.id, visibility: 'specified' });

					const res = await api('users/notes', { userId: bob.id, withReplies: true }, alice);

					expect(res.body.some((note) => note.id === bobNote1.id)).toBe(true);
					expect(res.body.some((note) => note.id === bobNote2.id)).toBe(false);
				});

				test(
					'[withFiles: true] ファイル付きノートのみ含まれる',
					async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const file = await uploadTimelineFile(bob);
						const bobNote1 = await post(bob, { text: 'hi' });
						const bobNote2 = await post(bob, { fileIds: [file.id] });

						const res = await api('users/notes', { userId: bob.id, withFiles: true }, alice);

						expect(res.body.some((note) => note.id === bobNote1.id)).toBe(false);
						expect(res.body.some((note) => note.id === bobNote2.id)).toBe(true);
					},
					1000 * 10,
				);

				test('[withChannelNotes: true] チャンネル投稿が含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const channel = await api('channels/create', { name: 'channel' }, bob).then((x) => x.body);
					const bobNote = await post(bob, { text: 'hi', channelId: channel.id });

					const res = await api('users/notes', { userId: bob.id, withChannelNotes: true }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
				});

				test('[withChannelNotes: true] 他人が取得した場合センシティブチャンネル投稿が含まれない', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const channel = await api('channels/create', { name: 'channel', isSensitive: true }, bob).then((x) => x.body);
					const bobNote = await post(bob, { text: 'hi', channelId: channel.id });

					const res = await api('users/notes', { userId: bob.id, withChannelNotes: true }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
				});

				test('[withChannelNotes: true] 自分が取得した場合センシティブチャンネル投稿が含まれる', async () => {
					const [bob] = await Promise.all([signup()]);

					const channel = await api('channels/create', { name: 'channel', isSensitive: true }, bob).then((x) => x.body);
					const bobNote = await post(bob, { text: 'hi', channelId: channel.id });

					const res = await api('users/notes', { userId: bob.id, withChannelNotes: true }, bob);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
				});

				test('[withChannelNotes: true] 他人が取得した場合センシティブチャンネル投稿のリノートが含まれない', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const channel = await api('channels/create', { name: 'channel', isSensitive: true }, bob).then((x) => x.body);
					const bobNote = await post(bob, { text: 'hi', channelId: channel.id });
					const bobRenote = await post(bob, { renoteId: bobNote.id });

					const res = await api('users/notes', { userId: bob.id, withChannelNotes: true }, alice);

					expect(res.body.some((note) => note.id === bobRenote.id)).toBe(false);
				});

				// リノート自体は channelId が NULL なので、チャンネル投稿を除外する条件では弾けない
				test('[withChannelNotes: false] 他人が取得した場合センシティブチャンネル投稿のリノートが含まれない', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const channel = await api('channels/create', { name: 'channel', isSensitive: true }, bob).then((x) => x.body);
					const bobNote = await post(bob, { text: 'hi', channelId: channel.id });
					const bobRenote = await post(bob, { renoteId: bobNote.id });

					const res = await api('users/notes', { userId: bob.id }, alice);

					expect(res.body.some((note) => note.id === bobRenote.id)).toBe(false);
				});

				test('[withChannelNotes: false] 他人が取得した場合通常チャンネル投稿のリノートは含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const channel = await api('channels/create', { name: 'channel' }, bob).then((x) => x.body);
					const bobNote = await post(bob, { text: 'hi', channelId: channel.id });
					const bobRenote = await post(bob, { renoteId: bobNote.id });

					const res = await api('users/notes', { userId: bob.id }, alice);

					expect(res.body.some((note) => note.id === bobRenote.id)).toBe(true);
				});

				test('[withChannelNotes: true] 自分が取得した場合センシティブチャンネル投稿のリノートが含まれる', async () => {
					const [bob] = await Promise.all([signup()]);

					const channel = await api('channels/create', { name: 'channel', isSensitive: true }, bob).then((x) => x.body);
					const bobNote = await post(bob, { text: 'hi', channelId: channel.id });
					const bobRenote = await post(bob, { renoteId: bobNote.id });

					const res = await api('users/notes', { userId: bob.id, withChannelNotes: true }, bob);

					expect(res.body.some((note) => note.id === bobRenote.id)).toBe(true);
				});

				test('ミュートしているユーザーに関連する投稿が含まれない', async () => {
					const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

					await api('mute/create', { userId: carol.id }, alice);
					const carolNote = await post(carol, { text: 'hi' });
					const bobNote = await post(bob, { text: 'hi', renoteId: carolNote.id });

					const res = await api('users/notes', { userId: bob.id }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
				});

				test('ミュートしているユーザーのノートの、関係のないユーザによる引用ノートの、リノートが含まれない', async () => {
					const [alice, bob, carol, dave] = await Promise.all([signup(), signup(), signup(), signup()]);

					await api('mute/create', { userId: carol.id }, alice);
					const carolNote = await post(carol, { text: 'hi' });
					const daveNote = await post(dave, { text: 'quote hi', renoteId: carolNote.id });
					const bobNote = await post(bob, { renoteId: daveNote.id });

					const res = await api('users/notes', { userId: bob.id, limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
				});

				test('ミュートしているユーザーのノートの、関係のないユーザによるリプライの、リノートが含まれない', async () => {
					const [alice, bob, carol, dave] = await Promise.all([signup(), signup(), signup(), signup()]);

					await api('following/create', { userId: bob.id }, alice);
					await api('mute/create', { userId: carol.id }, alice);
					const carolNote = await post(carol, { text: 'hi' });
					const daveNote = await post(dave, { text: 'quote hi', replyId: carolNote.id });
					const bobNote = await post(bob, { renoteId: daveNote.id });

					const res = await api('users/notes', { userId: bob.id, limit: 100 }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
				});

				test('ミュートしていても userId に指定したユーザーの投稿が含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					await api('mute/create', { userId: bob.id }, alice);
					const bobNote1 = await post(bob, { text: 'hi' });
					const bobNote2 = await post(bob, { text: 'hi', replyId: bobNote1.id });
					const bobNote3 = await post(bob, { text: 'hi', renoteId: bobNote1.id });
					const bobNote4 = await post(bob, { renoteId: bobNote2.id });
					const bobNote5 = await post(bob, { renoteId: bobNote3.id });

					const res = await api('users/notes', { userId: bob.id }, alice);

					expect(res.body.some((note) => note.id === bobNote1.id)).toBe(true);
					expect(res.body.some((note) => note.id === bobNote2.id)).toBe(true);
					expect(res.body.some((note) => note.id === bobNote3.id)).toBe(true);
					expect(res.body.some((note) => note.id === bobNote4.id)).toBe(true);
					expect(res.body.some((note) => note.id === bobNote5.id)).toBe(true);
				});

				test('自身の visibility: specified なノートが含まれる', async () => {
					const [alice] = await Promise.all([signup()]);

					const aliceNote = await post(alice, { text: 'hi', visibility: 'specified' });

					const res = await api('users/notes', { userId: alice.id, withReplies: true }, alice);

					expect(res.body.some((note) => note.id === aliceNote.id)).toBe(true);
				});

				test('visibleUserIds に指定されてない visibility: specified なノートが含まれない', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const bobNote = await post(bob, { text: 'hi', visibility: 'specified' });

					const res = await api('users/notes', { userId: bob.id, withReplies: true }, alice);

					expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
				});

				/** @see https://github.com/misskey-dev/misskey/issues/14000 */
				test('FTT: sinceId にキャッシュより古いノートを指定しても、sinceId による絞り込みが正しく動作する', async () => {
					const alice = await signup();
					const noteSince = await post(alice, { text: 'Note where id will be `sinceId`.' });
					const note1 = await post(alice, { text: '1' });
					const note2 = await post(alice, { text: '2' });
					await redisForTimelines.del('list:userTimeline:' + alice.id);
					const note3 = await post(alice, { text: '3' });

					const res = await api('users/notes', { userId: alice.id, sinceId: noteSince.id });
					expect(res.body).toStrictEqual([note1, note2, note3]);
				});

				test('FTT: sinceId にキャッシュより古いノートを指定しても、sinceId と untilId による絞り込みが正しく動作する', async () => {
					const alice = await signup();
					const noteSince = await post(alice, { text: 'Note where id will be `sinceId`.' });
					const note1 = await post(alice, { text: '1' });
					const note2 = await post(alice, { text: '2' });
					await redisForTimelines.del('list:userTimeline:' + alice.id);
					const note3 = await post(alice, { text: '3' });
					const noteUntil = await post(alice, { text: 'Note where id will be `untilId`.' });
					await post(alice, { text: '4' });

					const res = await api('users/notes', { userId: alice.id, sinceId: noteSince.id, untilId: noteUntil.id });
					expect(res.body).toStrictEqual([note3, note2, note1]);
				});

				describe('Channel', () => {
					test('チャンネルミュートなし　＝　TLに流れる', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('users/notes', { userId: bob.id, withChannelNotes: true }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(true);
					});

					test('チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

						const res = await api('users/notes', { userId: bob.id, withChannelNotes: true }, alice);

						expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
					});

					test('[チャンネル外リノート] チャンネルミュートなし　＝　TLに流れる', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('users/notes', { userId: bob.id, withChannelNotes: true }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(true);
					});

					test('[チャンネル外リノート] チャンネルミュート　＝　TLに流れない', async () => {
						const [alice, bob] = await Promise.all([signup(), signup()]);

						const channel = await createChannel('channel', bob);
						await muteChannel(channel.id, alice);

						const aliceNote = await post(alice, { text: 'hi' });
						const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
						const bobRenote = await renote(bobNote.id, bob);

						const res = await api('users/notes', { userId: bob.id, withChannelNotes: true }, alice);

						expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(false);
					});
				});
			});

			describe('Channel TL', () => {
				test('閲覧中チャンネルのノートが含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const channel = await createChannel('channel', bob);

					const aliceNote = await post(alice, { text: 'hi' });
					const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

					const res = await api('channels/timeline', { channelId: channel.id }, alice);

					expect(res.body.some((note: any) => note.id === aliceNote.id)).toBe(false);
					expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(true);
				});

				test('閲覧中チャンネルとは別チャンネルのノートは含まれない', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const channel = await createChannel('channel', bob);
					const channel2 = await createChannel('channel', bob);

					const aliceNote = await post(alice, { text: 'hi' });
					const bobNote = await post(bob, { text: 'ok', channelId: channel2.id });

					const res = await api('channels/timeline', { channelId: channel.id }, alice);

					expect(res.body.some((note: any) => note.id === aliceNote.id)).toBe(false);
					expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
				});

				test('閲覧中チャンネルのノートにリノートが含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const channel = await createChannel('channel', bob);

					const aliceNote = await post(alice, { text: 'hi' });
					const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
					const bobRenote = await post(bob, { channelId: channel.id, renoteId: bobNote.id });

					const res = await api('channels/timeline', { channelId: channel.id }, alice);

					expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(true);
				});

				test('閲覧中チャンネルとは別チャンネルからのリノートが含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const channel = await createChannel('channel', bob);
					const channel2 = await createChannel('channel', bob);

					const aliceNote = await post(alice, { text: 'hi' });
					const bobNote = await post(bob, { text: 'ok', channelId: channel2.id });
					const bobRenote = await post(bob, { channelId: channel.id, renoteId: bobNote.id });

					const res = await api('channels/timeline', { channelId: channel.id }, alice);

					expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(true);
				});

				test('閲覧中チャンネルに自分の他人への返信が含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const channel = await createChannel('channel', bob);

					const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
					const aliceNote = await post(alice, { text: 'hi', replyId: bobNote.id, channelId: channel.id });

					const res = await api('channels/timeline', { channelId: channel.id }, alice);

					expect(res.body.some((note: any) => note.id === aliceNote.id)).toBe(true);
				});

				test('閲覧中チャンネルに他人の自分への返信が含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const channel = await createChannel('channel', bob);

					const aliceNote = await post(alice, { text: 'hi', channelId: channel.id });
					const bobNote = await post(bob, { text: 'ok', replyId: aliceNote.id, channelId: channel.id });

					const res = await api('channels/timeline', { channelId: channel.id }, alice);

					expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(true);
				});

				test('閲覧中チャンネルにミュートしているユーザのノートは含まれない', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					await api('mute/create', { userId: bob.id }, alice);

					const channel = await createChannel('channel', bob);

					const aliceNote = await post(alice, { text: 'hi' });
					const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

					const res = await api('channels/timeline', { channelId: channel.id }, alice);

					expect(res.body.some((note: any) => note.id === aliceNote.id)).toBe(false);
					expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
				});

				test('閲覧中チャンネルにこちらをブロックしているユーザのノートは含まれない', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					await api('blocking/create', { userId: alice.id }, bob);

					const channel = await createChannel('channel', bob);

					const aliceNote = await post(alice, { text: 'hi' });
					const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

					const res = await api('channels/timeline', { channelId: channel.id }, alice);

					expect(res.body.some((note: any) => note.id === aliceNote.id)).toBe(false);
					expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(false);
				});

				test('閲覧中チャンネルをミュートしていてもノートが含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const channel = await createChannel('channel', bob);
					await muteChannel(channel.id, alice);

					const aliceNote = await post(alice, { text: 'hi' });
					const bobNote = await post(bob, { text: 'ok', channelId: channel.id });

					const res = await api('channels/timeline', { channelId: channel.id }, alice);

					expect(res.body.some((note: any) => note.id === aliceNote.id)).toBe(false);
					expect(res.body.some((note: any) => note.id === bobNote.id)).toBe(true);
				});

				test('閲覧中チャンネルをミュートしていても、同チャンネルのリノートが含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const channel = await createChannel('channel', bob);
					await muteChannel(channel.id, alice);

					const aliceNote = await post(alice, { text: 'hi' });
					const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
					const bobRenote = await post(bob, { channelId: channel.id, renoteId: bobNote.id });

					const res = await api('channels/timeline', { channelId: channel.id }, alice);

					expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(true);
				});

				test('閲覧中チャンネルをミュートしていても、同チャンネルのリプライが含まれる', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const channel = await createChannel('channel', bob);
					await muteChannel(channel.id, alice);

					const aliceNote = await post(alice, { text: 'hi' });
					const bobNote = await post(bob, { text: 'ok', channelId: channel.id });
					const bobRenote = await post(bob, { channelId: channel.id, replyId: bobNote.id, text: 'ho' });

					const res = await api('channels/timeline', { channelId: channel.id }, alice);

					expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(true);
				});

				test('閲覧中チャンネルとは別チャンネルをミュートしているとき、そのチャンネルからのリノートは含まれない', async () => {
					const [alice, bob] = await Promise.all([signup(), signup()]);

					const channel = await createChannel('channel', bob);
					const channel2 = await createChannel('channel', bob);
					await muteChannel(channel2.id, alice);

					const aliceNote = await post(alice, { text: 'hi' });
					const bobNote = await post(bob, { text: 'ok', channelId: channel2.id });
					const bobRenote = await post(bob, { channelId: channel.id, renoteId: bobNote.id });

					const res = await api('channels/timeline', { channelId: channel.id }, alice);

					expect(res.body.some((note: any) => note.id === bobRenote.id)).toBe(false);
				});
			});
			// TODO: リノートミュート済みユーザーのテスト
			// TODO: ページネーションのテスト
		},
	);
});
