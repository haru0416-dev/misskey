/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'node:assert';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { WebSocket } from 'ws';
import { createFollowingInDatabase, findHashtagsByName, genId, openTestDatabase } from '../fixtures.js';
import type { TestDatabase } from '../fixtures.js';
import {
	api,
	connectStream,
	createAppToken,
	initTestDb,
	post,
	resolveStreamingUrl,
	signup,
	waitFire,
} from '../utils.js';
import type { StreamMessage, UserToken } from '../utils.js';
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
		let erinNote: misskey.entities.Note;
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
				erinNote = await post(erin, { text: 'erin' });

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

				// kyoko は他人宛ての返信も含め、ayano は含めない (withReplies の既定値)。
				await api('users/lists/update-membership', { listId: list.id, userId: kyoko.id, withReplies: true }, chitose);

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

			// クライアントの未読数のバッジは unreadNotification でだけ増える。ノートの通知 (メンション等) も、既読に
			// ならないまま 2 秒たてば流す。
			test('メンションの通知が既読にならなければ unreadNotification が流れる', async () => {
				await api('notifications/mark-all-as-read', {}, kyoko);

				const fired = await waitFire(
					kyoko,
					'main',
					() => post(ayano, { text: 'unread @kyoko' }),
					(msg) => msg.type === 'unreadNotification' && msg.body['type'] === 'mention',
					undefined,
					5000,
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
			// 流れないことは、同じ接続で後から流れるはずのノートの到着を待ってから判定する。配信の遅れで
			// 「流れなかった」と誤判定しないため。
			const isReceivedBeforeControl = async (
				trigger: () => Promise<misskey.entities.Note>,
				control: () => Promise<misskey.entities.Note>,
			): Promise<boolean> => {
				const receivedIds = new Set<unknown>();
				const controlArrived = Promise.withResolvers<void>();
				let controlId: string | undefined;
				const ws = await connectStream(
					chitose,
					'userList',
					(msg) => {
						if (msg.type !== 'note') return;
						receivedIds.add(msg.body['id']);
						if (controlId != null && msg.body['id'] === controlId) controlArrived.resolve();
					},
					{ listId: list.id },
				);
				let timer: ReturnType<typeof setTimeout> | undefined;
				try {
					const target = await trigger();
					controlId = (await control()).id;
					if (receivedIds.has(controlId)) controlArrived.resolve();
					await Promise.race([
						controlArrived.promise,
						new Promise((_, reject) => {
							timer = setTimeout(() => reject(new Error('control note did not arrive')), 5000);
						}),
					]);
					await new Promise((resolve) => setTimeout(resolve, STREAMING_NEGATIVE_TIMEOUT_MS));
					return receivedIds.has(target.id);
				} finally {
					clearTimeout(timer);
					ws.terminate();
				}
			};

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

			test('withReplies が有効なメンバーの他人宛てのリプライが流れる', async () => {
				const fired = await waitFire(
					chitose,
					'userList',
					() => api('notes/create', { text: 'foo', replyId: erinNote.id }, kyoko),
					(msg) => msg.type === 'note' && msg.body['userId'] === kyoko.id && msg.body['replyId'] === erinNote.id,
					{ listId: list.id },
					5000,
				);

				expect(fired).toBe(true);
			});

			// withReplies を有効にしても、無効のときに流れる返信 (所有者宛て・投稿者の自己返信) は減らさない。
			test('withReplies が有効なメンバーによる、所有者のフォロワー限定ノートへのリプライが流れる', async () => {
				const ownerNote = await post(chitose, { text: 'owner followers only', visibility: 'followers' });
				const fired = await waitFire(
					chitose,
					'userList',
					() => api('notes/create', { text: 'reply to owner', replyId: ownerNote.id }, kyoko),
					(msg) => msg.type === 'note' && msg.body['replyId'] === ownerNote.id,
					{ listId: list.id },
					5000,
				);

				expect(fired).toBe(true);
			});

			// フォロワー限定ノートへの返信はフォロワー限定になるので、所有者に見えるのは所有者へのメンションを含むとき。
			test('withReplies が有効で所有者がフォローしていないメンバーの、自分のフォロワー限定ノートへの自己返信が流れる', async () => {
				const memberNote = await post(kyoko, { text: 'member followers only', visibility: 'followers' });
				const fired = await waitFire(
					chitose,
					'userList',
					() => api('notes/create', { text: '@chitose self reply', replyId: memberNote.id }, kyoko),
					(msg) => msg.type === 'note' && msg.body['replyId'] === memberNote.id,
					{ listId: list.id },
					5000,
				);

				expect(fired).toBe(true);
			});

			test('withReplies が無効なメンバーの他人宛てのリプライは流れない', async () => {
				const received = await isReceivedBeforeControl(
					() => post(ayano, { text: 'foo', replyId: erinNote.id }),
					() => post(ayano, { text: 'control' }),
				);

				expect(received).toBe(false);
			});

			test('メンバーの withReplies の変更が次のノートから反映される', async () => {
				try {
					// メンバーの定期的な読み直し (5 秒ごと) を待たずに反映されることを、接続から 5 秒以内に確かめる。
					const fired = await waitFire(
						chitose,
						'userList',
						async () => {
							await api(
								'users/lists/update-membership',
								{ listId: list.id, userId: ayano.id, withReplies: true },
								chitose,
							);
							await api('notes/create', { text: 'foo', replyId: erinNote.id }, ayano);
						},
						(msg) => msg.type === 'note' && msg.body['userId'] === ayano.id && msg.body['replyId'] === erinNote.id,
						{ listId: list.id },
						2000,
					);

					expect(fired).toBe(true);
				} finally {
					await api(
						'users/lists/update-membership',
						{ listId: list.id, userId: ayano.id, withReplies: false },
						chitose,
					);
				}
			});

			// #10443
			test('ミュートしているユーザへのリプライがリストTLに流れない', async () => {
				const received = await isReceivedBeforeControl(
					() => post(kyoko, { text: 'foo', replyId: kanakoNote.id }),
					() => post(kyoko, { text: 'control', replyId: erinNote.id }),
				);

				expect(received).toBe(false);
			});

			// #10443
			test('ミュートしているユーザの投稿をリノートしたときリストTLに流れない', async () => {
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

				const received = await isReceivedBeforeControl(
					() => post(kyoko, { text: 'foo', replyId: takumiNote.id }),
					() => post(kyoko, { text: 'control', replyId: erinNote.id }),
				);

				expect(received).toBe(false);
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

		describe('資格失効', () => {
			const receive = (
				socket: WebSocket,
				predicate: (message: { type: string; body?: { type?: string; body?: { text?: string } } }) => boolean,
			) =>
				new Promise<void>((resolve, reject) => {
					const timer = setTimeout(() => {
						socket.off('message', onMessage);
						reject(new Error('Streaming message timed out'));
					}, 3000);
					const onMessage = (raw: WebSocket.RawData) => {
						if (!predicate(JSON.parse(raw.toString()))) return;
						clearTimeout(timer);
						socket.off('message', onMessage);
						resolve();
					};
					socket.on('message', onMessage);
				});

			const open = async (token: string) => {
				const url = resolveStreamingUrl();
				url.searchParams.set('i', token);
				const socket = new WebSocket(url);
				try {
					await new Promise<void>((resolve, reject) => {
						socket.once('open', resolve);
						socket.on('error', reject);
					});
					const connected = receive(socket, (message) => message.type === 'connected');
					socket.send(
						JSON.stringify({ type: 'connect', body: { channel: 'hybridTimeline', id: 'timeline', pong: true } }),
					);
					await connected;
					return socket;
				} catch (error) {
					if (socket.readyState !== WebSocket.CLOSED) socket.close();
					throw error;
				}
			};

			test.each(['tokenId', 'token', 'native', 'suspension'] as const)(
				'%s: 既存接続を切断し、別資格の接続は保持する',
				async (kind) => {
					const target = await signup();
					const other = await signup();
					const application = await createAppToken(target, ['read:account']);
					const apps = await api('i/apps', {}, target);
					const applicationId = apps.body[0]?.id;
					const survivorToken = await createAppToken(target, ['read:account']);
					const revokedToken = kind === 'native' || kind === 'suspension' ? target.token : application;
					const sockets = await Promise.all([open(revokedToken), open(survivorToken), open(other.token)]);
					const [revoked, sameAccount, otherAccount] = sockets;
					try {
						if (kind === 'native') {
							expect((await api('i/regenerate-token', { password: 'test' }, target)).status).toBe(204);
						} else if (kind === 'suspension') {
							expect((await api('admin/suspend-user', { userId: target.id }, ayano)).status).toBe(204);
						} else {
							assert.ok(applicationId);
							expect(
								(
									await api(
										'i/revoke-token',
										kind === 'token' ? { token: application } : { tokenId: applicationId },
										target,
									)
								).status,
							).toBe(204);
						}
						await vi.waitFor(() => expect(revoked.readyState).toBe(WebSocket.CLOSED));
						if (kind === 'suspension') {
							await vi.waitFor(() => expect(sameAccount.readyState).toBe(WebSocket.CLOSED));
						}
						const survivors = kind === 'suspension' ? [otherAccount] : [sameAccount, otherAccount];
						const delivered = survivors.map((socket) =>
							receive(
								socket,
								(message) =>
									message.type === 'channel' &&
									message.body?.type === 'note' &&
									message.body.body?.text === `after-${target.id}`,
							),
						);
						await post(ayano, { text: `after-${target.id}` });
						await Promise.all(delivered);
						await expect(open(revokedToken)).rejects.toThrow();
					} finally {
						for (const socket of sockets) socket.close();
					}
				},
			);
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

			test('指定したハッシュタグの投稿が流れる (AND + OR)', async () => {
				const query = [['streamingmixedfoo', 'streamingmixedbar'], ['streamingmixedpiyo']];
				expect(await receives(query, '#streamingmixedfoo #streamingmixedbar')).toBe(true);
				expect(await receives(query, '#streamingmixedpiyo')).toBe(true);
				expect(await doesNotReceive(query, '#streamingmixedfoo')).toBe(false);
				expect(await doesNotReceive(query, '#streamingmixedwaaa')).toBe(false);
			});

			test('指定公開返信の受信者が読めない親投稿は本文と CW を隠す', async () => {
				const parent = await post(chitose, {
					text: 'private parent body',
					cw: 'private parent warning',
					visibility: 'specified',
					visibleUserIds: [kyoko.id],
				});
				const direct = await api('notes/show', { noteId: parent.id }, ayano);
				expect(direct.body).toMatchObject({ id: parent.id, text: null, cw: null, isHidden: true });
				let streamed: StreamMessage | undefined;
				const socket = await connectStream(
					ayano,
					'hashtag',
					(message) => {
						if (message.type === 'note' && message.body['replyId'] === parent.id) streamed = message;
					},
					{ q: [['streamingprivatereply']] },
				);
				try {
					const reply = await api(
						'notes/create',
						{
							text: '#streamingprivatereply visible reply',
							replyId: parent.id,
							visibility: 'specified',
							visibleUserIds: [chitose.id, ayano.id],
						},
						kyoko,
					);
					expect(reply.status).toBe(200);
					const replyId = reply.body.createdNote!.id;
					await vi.waitFor(() => expect(streamed?.body['id']).toBe(replyId), { timeout: 5000 });
					expect(streamed?.body['text']).toBe('#streamingprivatereply visible reply');
					expect(streamed?.body['reply']).toMatchObject({
						id: parent.id,
						text: null,
						cw: null,
						isHidden: true,
					});
					const authorView = await api('notes/show', { noteId: replyId }, chitose);
					expect(authorView.body.reply).toMatchObject({
						id: parent.id,
						text: 'private parent body',
						cw: 'private parent warning',
					});
				} finally {
					socket.close();
				}
			});

			test('同名タグの並行作成でユーザー情報を失わない', async () => {
				const tag = `concurrenthashtag${Date.now().toString(36)}`;
				await Promise.all([post(ayano, { text: `#${tag}` }), post(chitose, { text: `#${tag}` })]);

				const rows = await findHashtagsByName(db, tag);
				expect(rows).toHaveLength(1);
				const row = rows[0];
				assert.ok(row);
				expect(row.mentionedUsersCount).toBe(2);
				expect(row.mentionedLocalUsersCount).toBe(2);
			});
		});
	});
});
