/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'assert';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { WebSocket } from 'ws';
import {
	createFollowingInDatabase,
	findHashtagsByName,
	genId,
	openTestDatabase,
	type TestDatabase,
} from '../fixtures.js';
import {
	api,
	createAppToken,
	initTestDb,
	post,
	resolveStreamingUrl,
	signup,
	waitFire,
	type StreamMessage,
	type UserToken,
} from '../utils.js';
import type * as misskey from 'misskey-js';

describe('Streaming', () => {
	let db: TestDatabase;
	const STREAMING_NEGATIVE_TIMEOUT_MS = 500;

	const follow = async (follower: any, followee: any) => {
		await createFollowingInDatabase(db, {
			id: genId(),
			followerId: follower.id,
			followeeId: followee.id,
			followerHost: follower.host,
			followerInbox: null,
			followerSharedInbox: null,
			followeeHost: followee.host,
			followeeInbox: null,
			followeeSharedInbox: null,
		});
	};

	afterAll(async () => {
		await db.close();
	});

	const waitFireWithoutEvent = <C extends keyof misskey.Channels>(
		user: UserToken,
		channel: C,
		trgr: () => any,
		cond: (msg: StreamMessage) => boolean,
		params?: misskey.Channels[C]['params'],
	) => waitFire(user, channel, trgr, cond, params, STREAMING_NEGATIVE_TIMEOUT_MS);

	describe('Streaming', () => {
		let ayano: misskey.entities.SignupResponse;
		let kyoko: misskey.entities.SignupResponse;
		let chitose: misskey.entities.SignupResponse;
		let kanako: misskey.entities.SignupResponse;
		let erin: misskey.entities.SignupResponse;

		let akari: misskey.entities.SignupResponse;
		let chinatsu: misskey.entities.SignupResponse;
		let takumi: misskey.entities.SignupResponse;

		let kyokoNote: misskey.entities.Note;
		let kanakoNote: misskey.entities.Note;
		let takumiNote: misskey.entities.Note;
		let list: any;

		beforeAll(
			async () => {
				await initTestDb(true);
				db = openTestDatabase();

				ayano = await signup({ username: 'ayano' });
				kyoko = await signup({ username: 'kyoko' });
				chitose = await signup({ username: 'chitose' });
				kanako = await signup({ username: 'kanako' });
				erin = await signup({ username: 'erin' });

				akari = await signup({ username: 'akari', host: 'example.com' });
				chinatsu = await signup({ username: 'chinatsu', host: 'example.com' });
				takumi = await signup({ username: 'takumi', host: 'example.com' });

				kyokoNote = await post(kyoko, { text: 'foo' });
				kanakoNote = await post(kanako, { text: 'hoge' });
				takumiNote = await post(takumi, { text: 'piyo' });

				await api('following/create', { userId: kyoko.id, withReplies: false }, ayano);

				await follow(ayano, akari);

				await api('following/create', { userId: chitose.id }, kyoko);

				await api('following/create', { userId: ayano.id, withReplies: true }, erin);
				await api('following/create', { userId: erin.id, withReplies: false }, ayano);

				await api('mute/create', { userId: kanako.id }, chitose);

				list = await api(
					'users/lists/create',
					{
						name: 'my list',
					},
					chitose,
				).then((x) => x.body);

				await api(
					'users/lists/push',
					{
						listId: list.id,
						userId: ayano.id,
					},
					chitose,
				);

				await api(
					'users/lists/push',
					{
						listId: list.id,
						userId: kyoko.id,
					},
					chitose,
				);

				await api(
					'users/lists/push',
					{
						listId: list.id,
						userId: takumi.id,
					},
					chitose,
				);
			},
			1000 * 60 * 2,
		);

		describe('Events', () => {
			test('mention event', async () => {
				const fired = await waitFire(
					kyoko,
					'main',
					() => post(ayano, { text: 'foo @kyoko bar' }),
					(msg) => msg.type === 'mention' && msg.body['userId'] === ayano.id,
				);

				expect(fired).toBe(true);
			});

			test('renote event', async () => {
				const fired = await waitFire(
					kyoko,
					'main',
					() => post(ayano, { renoteId: kyokoNote.id }),
					(msg) => msg.type === 'renote' && msg.body['renoteId'] === kyokoNote.id,
				);

				expect(fired).toBe(true);
			});
		});

		describe('Home Timeline', () => {
			test('自分の投稿が流れる', async () => {
				const fired = await waitFire(
					ayano,
					'homeTimeline',
					() => api('notes/create', { text: 'foo' }, ayano),
					(msg) => msg.type === 'note' && msg.body['text'] === 'foo',
				);

				expect(fired).toBe(true);
			});

			test('自分の visibility: followers な投稿が流れる', async () => {
				const fired = await waitFire(
					ayano,
					'homeTimeline',
					() => api('notes/create', { text: 'foo', visibility: 'followers' }, ayano),
					(msg) => msg.type === 'note' && msg.body['text'] === 'foo',
				);

				expect(fired).toBe(true);
			});

			test('フォローしているユーザーの投稿が流れる', async () => {
				const fired = await waitFire(
					ayano,
					'homeTimeline',
					() => api('notes/create', { text: 'foo' }, kyoko),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id,
				);

				expect(fired).toBe(true);
			});

			test('フォローしているユーザーの visibility: followers な投稿が流れる', async () => {
				const fired = await waitFire(
					ayano,
					'homeTimeline',
					() => api('notes/create', { text: 'foo', visibility: 'followers' }, kyoko),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id,
				);

				expect(fired).toBe(true);
			});

			test('フォローしているユーザーの visibility: followers な投稿への返信が流れる', async () => {
				const note = await post(kyoko, { text: 'foo', visibility: 'followers' });

				const fired = await waitFire(
					ayano,
					'homeTimeline',
					() => api('notes/create', { text: 'bar', visibility: 'followers', replyId: note.id }, kyoko),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id && msg.body['replyId'] === note.id,
				);

				expect(fired).toBe(true);
			});

			test('フォローしているユーザーのフォローしていないユーザーの visibility: followers な投稿への返信が流れない', async () => {
				const chitoseNote = await post(chitose, { text: 'followers-only post', visibility: 'followers' });

				const fired = await waitFireWithoutEvent(
					ayano,
					'homeTimeline',
					() => api('notes/create', { text: "reply to chitose's followers-only post", replyId: chitoseNote.id }, kyoko),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id,
				);

				expect(fired).toBe(false);
			});

			test('フォローしているユーザーのフォローしていないユーザーの visibility: followers な投稿への返信のリノートが流れない', async () => {
				const chitoseNote = await post(chitose, { text: 'followers-only post', visibility: 'followers' });
				const kyokoReply = await post(kyoko, { text: 'reply to followers-only post', replyId: chitoseNote.id });

				const fired = await waitFireWithoutEvent(
					ayano,
					'homeTimeline',
					() => api('notes/create', { renoteId: kyokoReply.id }, kyoko),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id,
				);

				expect(fired).toBe(false);
			});

			test('フォローしていないユーザーの投稿は流れない', async () => {
				const fired = await waitFireWithoutEvent(
					kyoko,
					'homeTimeline',
					() => api('notes/create', { text: 'foo' }, ayano),
					(msg) => msg.type === 'note' && msg.body['userId'] === ayano.id,
				);

				expect(fired).toBe(false);
			});

			test('フォローしているユーザーのダイレクト投稿が流れる', async () => {
				const fired = await waitFire(
					ayano,
					'homeTimeline',
					() => api('notes/create', { text: 'foo', visibility: 'specified', visibleUserIds: [ayano.id] }, kyoko),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id,
				);

				expect(fired).toBe(true);
			});

			test('フォローしているユーザーでも自分が指定されていないダイレクト投稿は流れない', async () => {
				const fired = await waitFireWithoutEvent(
					ayano,
					'homeTimeline',
					() => api('notes/create', { text: 'foo', visibility: 'specified', visibleUserIds: [chitose.id] }, kyoko),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id,
				);

				expect(fired).toBe(false);
			});

			/**
			 * TODO: 落ちる
			 * @see https://github.com/misskey-dev/misskey/issues/13474
			test('visibility: specified なノートで visibleUserIds に自分が含まれているときそのノートへのリプライが流れてくる', async () => {
				const chitoseToKyokoAndAyano = await post(chitose, { text: 'direct note from chitose to kyoko and ayano', visibility: 'specified', visibleUserIds: [kyoko.id, ayano.id] });

				const fired = await waitFire(
					ayano, 'homeTimeline',
					() => api('notes/create', { text: 'direct reply from kyoko to chitose and ayano', replyId: chitoseToKyokoAndAyano.id, visibility: 'specified', visibleUserIds: [chitose.id, ayano.id] }, kyoko),
					msg => msg.type === 'note' && msg.body['userId'] === kyoko.id,
				);

				expect(fired).toBe(true);
			});
			 */

			test('visibility: specified な投稿に対するリプライで visibleUserIds が拡張されたとき、その拡張されたユーザーの HTL にはそのリプライが流れない', async () => {
				const chitoseToKyoko = await post(chitose, {
					text: 'direct note from chitose to kyoko',
					visibility: 'specified',
					visibleUserIds: [kyoko.id],
				});

				const fired = await waitFireWithoutEvent(
					ayano,
					'homeTimeline',
					() =>
						api(
							'notes/create',
							{
								text: 'direct reply from kyoko to chitose and ayano',
								replyId: chitoseToKyoko.id,
								visibility: 'specified',
								visibleUserIds: [chitose.id, ayano.id],
							},
							kyoko,
						),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id,
				);

				expect(fired).toBe(false);
			});

			test('visibility: specified な投稿に対するリプライで visibleUserIds が収縮されたとき、その収縮されたユーザーの HTL にはそのリプライが流れない', async () => {
				const chitoseToKyokoAndAyano = await post(chitose, {
					text: 'direct note from chitose to kyoko and ayano',
					visibility: 'specified',
					visibleUserIds: [kyoko.id, ayano.id],
				});

				const fired = await waitFireWithoutEvent(
					ayano,
					'homeTimeline',
					() =>
						api(
							'notes/create',
							{
								text: 'direct reply from kyoko to chitose',
								replyId: chitoseToKyokoAndAyano.id,
								visibility: 'specified',
								visibleUserIds: [chitose.id],
							},
							kyoko,
						),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id,
				);

				expect(fired).toBe(false);
			});

			test('withRenotes: false のときリノートが流れない', async () => {
				const fired = await waitFireWithoutEvent(
					ayano,
					'homeTimeline',
					() => api('notes/create', { renoteId: kyokoNote.id }, kyoko),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id,
					{ withRenotes: false },
				);

				expect(fired).toBe(false);
			});

			test('withRenotes: false のとき引用リノートが流れる', async () => {
				const fired = await waitFire(
					ayano,
					'homeTimeline',
					() => api('notes/create', { text: 'quote', renoteId: kyokoNote.id }, kyoko),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id,
					{ withRenotes: false },
				);

				expect(fired).toBe(true);
			});

			test('withRenotes: false のとき投票のみのリノートが流れる', async () => {
				const fired = await waitFire(
					ayano,
					'homeTimeline',
					() => api('notes/create', { poll: { choices: ['kinoko', 'takenoko'] }, renoteId: kyokoNote.id }, kyoko),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id,
					{ withRenotes: false },
				);

				expect(fired).toBe(true);
			});

			test('withReplies: true のとき自分のfollowers投稿に対するリプライが流れる', async () => {
				const erinNote = await post(erin, { text: 'hi', visibility: 'followers' });
				const fired = await waitFire(
					erin,
					'hybridTimeline',
					() => api('notes/create', { text: 'hello', replyId: erinNote.id }, ayano),
					(msg) => msg.type === 'note' && msg.body['userId'] === ayano.id,
				);

				expect(fired).toBe(true);
			});

			test('withReplies: false でも自分の投稿に対するリプライが流れる', async () => {
				const ayanoNote = await post(ayano, { text: 'hi', visibility: 'followers' });
				const fired = await waitFire(
					ayano,
					'hybridTimeline',
					() => api('notes/create', { text: 'hello', replyId: ayanoNote.id }, erin),
					(msg) => msg.type === 'note' && msg.body['userId'] === erin.id,
				);

				expect(fired).toBe(true);
			});
		});

		describe('Local Timeline', () => {
			test('自分の投稿が流れる', async () => {
				const fired = await waitFire(
					ayano,
					'localTimeline',
					() => api('notes/create', { text: 'foo' }, ayano),
					(msg) => msg.type === 'note' && msg.body['text'] === 'foo',
				);

				expect(fired).toBe(true);
			});

			test('フォローしていないローカルユーザーの投稿が流れる', async () => {
				const fired = await waitFire(
					ayano,
					'localTimeline',
					() => api('notes/create', { text: 'foo' }, chitose),
					(msg) => msg.type === 'note' && msg.body['userId'] === chitose.id,
				);

				expect(fired).toBe(true);
			});

			/* TODO
			test('リモートユーザーの投稿は流れない', async () => {
				const fired = await waitFire(
					ayano, 'localTimeline',
					() => api('notes/create', { text: 'foo' }, chinatsu),
					msg => msg.type === 'note' && msg.body.userId === chinatsu.id,
				);

				expect(fired).toBe(false);
			});

			test('フォローしてたとしてもリモートユーザーの投稿は流れない', async () => {
				const fired = await waitFire(
					ayano, 'localTimeline',
					() => api('notes/create', { text: 'foo' }, akari),
					msg => msg.type === 'note' && msg.body.userId === akari.id,
				);

				expect(fired).toBe(false);
			});
			*/

			test('ホーム指定の投稿は流れない', async () => {
				const fired = await waitFireWithoutEvent(
					ayano,
					'localTimeline',
					() => api('notes/create', { text: 'foo', visibility: 'home' }, kyoko),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id,
				);

				expect(fired).toBe(false);
			});

			test('フォローしているローカルユーザーのダイレクト投稿は流れない', async () => {
				const fired = await waitFireWithoutEvent(
					ayano,
					'localTimeline',
					() => api('notes/create', { text: 'foo', visibility: 'specified', visibleUserIds: [ayano.id] }, kyoko),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id,
				);

				expect(fired).toBe(false);
			});

			test('フォローしていないローカルユーザーのフォロワー宛て投稿は流れない', async () => {
				const fired = await waitFireWithoutEvent(
					ayano,
					'localTimeline',
					() => api('notes/create', { text: 'foo', visibility: 'followers' }, chitose),
					(msg) => msg.type === 'note' && msg.body['userId'] === chitose.id,
				);

				expect(fired).toBe(false);
			});
		});

		describe('Hybrid Timeline', () => {
			test('自分の投稿が流れる', async () => {
				const fired = await waitFire(
					ayano,
					'hybridTimeline',
					() => api('notes/create', { text: 'foo' }, ayano),
					(msg) => msg.type === 'note' && msg.body['text'] === 'foo',
				);

				expect(fired).toBe(true);
			});

			test('自分の visibility: followers な投稿が流れる', async () => {
				const fired = await waitFire(
					ayano,
					'hybridTimeline',
					() => api('notes/create', { text: 'foo', visibility: 'followers' }, ayano),
					(msg) => msg.type === 'note' && msg.body['text'] === 'foo',
				);

				expect(fired).toBe(true);
			});

			test('フォローしていないローカルユーザーの投稿が流れる', async () => {
				const fired = await waitFire(
					ayano,
					'hybridTimeline',
					() => api('notes/create', { text: 'foo' }, chitose),
					(msg) => msg.type === 'note' && msg.body['userId'] === chitose.id,
				);

				expect(fired).toBe(true);
			});

			/* TODO
			test('フォローしているリモートユーザーの投稿が流れる', async () => {
				const fired = await waitFire(
					ayano, 'hybridTimeline',
					() => api('notes/create', { text: 'foo' }, akari),
					msg => msg.type === 'note' && msg.body.userId === akari.id,
				);

				expect(fired).toBe(true);
			});

			test('フォローしていないリモートユーザーの投稿は流れない', async () => {
				const fired = await waitFire(
					ayano, 'hybridTimeline',
					() => api('notes/create', { text: 'foo' }, chinatsu),
					msg => msg.type === 'note' && msg.body.userId === chinatsu.id,
				);

				expect(fired).toBe(false);
			});
			*/

			test('フォローしているユーザーのダイレクト投稿が流れる', async () => {
				const fired = await waitFire(
					ayano,
					'hybridTimeline',
					() => api('notes/create', { text: 'foo', visibility: 'specified', visibleUserIds: [ayano.id] }, kyoko),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id,
				);

				expect(fired).toBe(true);
			});

			test('フォローしているユーザーのホーム投稿が流れる', async () => {
				const fired = await waitFire(
					ayano,
					'hybridTimeline',
					() => api('notes/create', { text: 'foo', visibility: 'home' }, kyoko),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id,
				);

				expect(fired).toBe(true);
			});

			test('フォローしているユーザーの visibility: followers な投稿が流れる', async () => {
				const fired = await waitFire(
					ayano,
					'hybridTimeline',
					() => api('notes/create', { text: 'foo', visibility: 'followers' }, kyoko),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id,
				);

				expect(fired).toBe(true);
			});

			test('フォローしていないローカルユーザーのホーム投稿は流れない', async () => {
				const fired = await waitFireWithoutEvent(
					ayano,
					'hybridTimeline',
					() => api('notes/create', { text: 'foo', visibility: 'home' }, chitose),
					(msg) => msg.type === 'note' && msg.body['userId'] === chitose.id,
				);

				expect(fired).toBe(false);
			});

			test('フォローしていないローカルユーザーのフォロワー宛て投稿は流れない', async () => {
				const fired = await waitFireWithoutEvent(
					ayano,
					'hybridTimeline',
					() => api('notes/create', { text: 'foo', visibility: 'followers' }, chitose),
					(msg) => msg.type === 'note' && msg.body['userId'] === chitose.id,
				);

				expect(fired).toBe(false);
			});

			test('withReplies: true のとき自分のfollowers投稿に対するリプライが流れる', async () => {
				const erinNote = await post(erin, { text: 'hi', visibility: 'followers' });
				const fired = await waitFire(
					erin,
					'homeTimeline',
					() => api('notes/create', { text: 'hello', replyId: erinNote.id }, ayano),
					(msg) => msg.type === 'note' && msg.body['userId'] === ayano.id,
				);

				expect(fired).toBe(true);
			});

			test('withReplies: false でも自分の投稿に対するリプライが流れる', async () => {
				const ayanoNote = await post(ayano, { text: 'hi', visibility: 'followers' });
				const fired = await waitFire(
					ayano,
					'homeTimeline',
					() => api('notes/create', { text: 'hello', replyId: ayanoNote.id }, erin),
					(msg) => msg.type === 'note' && msg.body['userId'] === erin.id,
				);

				expect(fired).toBe(true);
			});

			test('withReplies: true のフォローしていない人のfollowersノートに対するリプライが流れない', async () => {
				// ayano は kyoko をフォローしているため kyoko の followers 投稿にリプライできるが、
				// erin は kyoko をフォローしていないため、そのリプライは erin の Hybrid Timeline には流れないはず
				const kyokoFollowersNote = await post(kyoko, { text: 'hi', visibility: 'followers' });
				const fired = await waitFireWithoutEvent(
					erin,
					'hybridTimeline',
					() => api('notes/create', { text: 'hello', replyId: kyokoFollowersNote.id }, ayano),
					(msg) => msg.type === 'note' && msg.body['userId'] === ayano.id,
				);

				expect(fired).toBe(false);
			});
		});

		describe('Global Timeline', () => {
			test('フォローしていないローカルユーザーの投稿が流れる', async () => {
				const fired = await waitFire(
					ayano,
					'globalTimeline',
					() => api('notes/create', { text: 'foo' }, chitose),
					(msg) => msg.type === 'note' && msg.body['userId'] === chitose.id,
				);

				expect(fired).toBe(true);
			});

			/* TODO
			test('フォローしていないリモートユーザーの投稿が流れる', async () => {
				const fired = await waitFire(
					ayano, 'globalTimeline',
					() => api('notes/create', { text: 'foo' }, chinatsu),
					msg => msg.type === 'note' && msg.body.userId === chinatsu.id,
				);

				expect(fired).toBe(true);
			});
			*/

			test('ホーム投稿は流れない', async () => {
				const fired = await waitFireWithoutEvent(
					ayano,
					'globalTimeline',
					() => api('notes/create', { text: 'foo', visibility: 'home' }, kyoko),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id,
				);

				expect(fired).toBe(false);
			});

			test('withReplies = falseでフォローしてる人によるリプライが流れてくる', async () => {
				const fired = await waitFire(
					ayano,
					'globalTimeline',
					() => api('notes/create', { text: 'foo', replyId: kanakoNote.id }, kyoko),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id,
				);

				expect(fired).toBe(true);
			});
		});

		describe('UserList Timeline', () => {
			test('リストに入れているユーザーの投稿が流れる', async () => {
				const fired = await waitFire(
					chitose,
					'userList',
					() => api('notes/create', { text: 'foo' }, ayano),
					(msg) => msg.type === 'note' && msg.body['userId'] === ayano.id,
					{ listId: list.id },
				);

				expect(fired).toBe(true);
			});

			test('リストに入れていないユーザーの投稿は流れない', async () => {
				const fired = await waitFireWithoutEvent(
					chitose,
					'userList',
					() => api('notes/create', { text: 'foo' }, chinatsu),
					(msg) => msg.type === 'note' && msg.body['userId'] === chinatsu.id,
					{ listId: list.id },
				);

				expect(fired).toBe(false);
			});

			// #4471
			test('リストに入れているユーザーのダイレクト投稿が流れる', async () => {
				const fired = await waitFire(
					chitose,
					'userList',
					() => api('notes/create', { text: 'foo', visibility: 'specified', visibleUserIds: [chitose.id] }, ayano),
					(msg) => msg.type === 'note' && msg.body['userId'] === ayano.id,
					{ listId: list.id },
				);

				expect(fired).toBe(true);
			});

			// #4335
			test('リストに入れているがフォローはしてないユーザーのフォロワー宛て投稿は流れない', async () => {
				const fired = await waitFireWithoutEvent(
					chitose,
					'userList',
					() => api('notes/create', { text: 'foo', visibility: 'followers' }, kyoko),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id,
					{ listId: list.id },
				);

				expect(fired).toBe(false);
			});

			// #10443
			test('チャンネル投稿は流れない', async () => {
				// リスインしている kyoko が 任意のチャンネルに投降した時の動きを見たい
				const fired = await waitFireWithoutEvent(
					chitose,
					'userList',
					() => api('notes/create', { text: 'foo', channelId: 'dummy' }, kyoko),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id,
					{ listId: list.id },
				);

				expect(fired).toBe(false);
			});

			// #10443
			test('ミュートしているユーザへのリプライがリストTLに流れない', async () => {
				// chitose が kanako をミュートしている状態で、リスインしている kyoko が kanako にリプライした時の動きを見たい
				const fired = await waitFireWithoutEvent(
					chitose,
					'userList',
					() => api('notes/create', { text: 'foo', replyId: kanakoNote.id }, kyoko),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id,
					{ listId: list.id },
				);

				expect(fired).toBe(false);
			});

			// #10443
			test('ミュートしているユーザの投稿をリノートしたときリストTLに流れない', async () => {
				// chitose が kanako をミュートしている状態で、リスインしている kyoko が kanako のノートをリノートした時の動きを見たい
				const fired = await waitFireWithoutEvent(
					chitose,
					'userList',
					() => api('notes/create', { renoteId: kanakoNote.id }, kyoko),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id,
					{ listId: list.id },
				);

				expect(fired).toBe(false);
			});

			// #10443
			test('ミュートしているサーバのノートがリストTLに流れない', async () => {
				await api(
					'i/update',
					{
						mutedInstances: ['example.com'],
					},
					chitose,
				);

				// chitose が example.com をミュートしている状態で、リスインしている takumi が ノートした時の動きを見たい
				const fired = await waitFireWithoutEvent(
					chitose,
					'userList',
					() => api('notes/create', { text: 'foo' }, takumi),
					(msg) => msg.type === 'note' && msg.body['userId'] === takumi.id,
					{ listId: list.id },
				);

				expect(fired).toBe(false);
			});

			// #10443
			test('ミュートしているサーバのノートに対するリプライがリストTLに流れない', async () => {
				await api(
					'i/update',
					{
						mutedInstances: ['example.com'],
					},
					chitose,
				);

				// chitose が example.com をミュートしている状態で、リスインしている kyoko が takumi のノートにリプライした時の動きを見たい
				const fired = await waitFireWithoutEvent(
					chitose,
					'userList',
					() => api('notes/create', { text: 'foo', replyId: takumiNote.id }, kyoko),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id,
					{ listId: list.id },
				);

				expect(fired).toBe(false);
			});

			// #10443
			test('ミュートしているサーバのノートに対するリノートがリストTLに流れない', async () => {
				await api(
					'i/update',
					{
						mutedInstances: ['example.com'],
					},
					chitose,
				);

				// chitose が example.com をミュートしている状態で、リスインしている kyoko が takumi のノートをリノートした時の動きを見たい
				const fired = await waitFireWithoutEvent(
					chitose,
					'userList',
					() => api('notes/create', { renoteId: takumiNote.id }, kyoko),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id,
					{ listId: list.id },
				);

				expect(fired).toBe(false);
			});
		});

		test('Authentication', async () => {
			const application = await createAppToken(ayano, []);
			const application2 = await createAppToken(ayano, ['read:account']);
			const url = resolveStreamingUrl();
			url.searchParams.set('i', application);
			const socket = new WebSocket(url);
			const established = await new Promise<boolean>((resolve, reject) => {
				socket.on('error', () => resolve(false));
				socket.on('unexpected-response', () => resolve(false));
				setTimeout(() => resolve(true), 3000);
			});

			socket.close();
			expect(established).toBe(false);

			const fired = await waitFire(
				{ token: application2 },
				'hybridTimeline',
				() => api('notes/create', { text: 'Hello, world!' }, ayano),
				(msg) => msg.type === 'note' && msg.body['userId'] === ayano.id,
			);

			expect(fired).toBe(true);
		});

		describe('Hashtag Timeline', () => {
			const receives = (query: string[][], text: string) =>
				waitFire(
					chitose,
					'hashtag',
					() => post(chitose, { text }),
					(msg) => msg.type === 'note' && msg.body['text'] === text,
					{ q: query },
				);

			const doesNotReceive = (query: string[][], text: string) =>
				waitFireWithoutEvent(
					chitose,
					'hashtag',
					() => post(chitose, { text }),
					(msg) => msg.type === 'note' && msg.body['text'] === text,
					{ q: query },
				);

			test('指定したハッシュタグの投稿が流れる', async () => {
				expect(await receives([['streaminghashtag']], '#streaminghashtag')).toBe(true);
			});

			test('指定したハッシュタグの投稿が流れる (AND)', async () => {
				const query = [['streamingandfoo', 'streamingandbar']];
				expect(await receives(query, '#streamingandfoo #streamingandbar')).toBe(true);
				expect(await doesNotReceive(query, '#streamingandfoo')).toBe(false);
			});

			test('指定したハッシュタグの投稿が流れる (OR)', async () => {
				const query = [['streamingorfoo'], ['streamingorbar']];
				expect(await receives(query, '#streamingorfoo')).toBe(true);
				expect(await receives(query, '#streamingorbar')).toBe(true);
				expect(await receives(query, '#streamingorfoo #streamingorbar')).toBe(true);
				expect(await doesNotReceive(query, '#streamingorpiyo')).toBe(false);
			});

			test('指定したハッシュタグの投稿が流れる (AND + OR)', async () => {
				const query = [['streamingmixedfoo', 'streamingmixedbar'], ['streamingmixedpiyo']];
				expect(await receives(query, '#streamingmixedfoo #streamingmixedbar')).toBe(true);
				expect(await receives(query, '#streamingmixedpiyo')).toBe(true);
				expect(await doesNotReceive(query, '#streamingmixedfoo')).toBe(false);
				expect(await doesNotReceive(query, '#streamingmixedwaaa')).toBe(false);
			});

			test('同名タグの並行作成でユーザー情報を失わない', async () => {
				const tag = `concurrenthashtag${Date.now().toString(36)}`;
				await Promise.all([post(ayano, { text: `#${tag}` }), post(chitose, { text: `#${tag}` })]);

				const rows = await findHashtagsByName(db, tag);
				expect(rows.length).toBe(1);
				const row = rows[0];
				assert.ok(row);
				expect(row.mentionedUserIds.toSorted()).toStrictEqual([ayano.id, chitose.id].toSorted());
				expect(row.mentionedUsersCount).toBe(2);
				expect(row.mentionedLocalUserIds.toSorted()).toStrictEqual([ayano.id, chitose.id].toSorted());
				expect(row.mentionedLocalUsersCount).toBe(2);
			});
		});
	});
});
