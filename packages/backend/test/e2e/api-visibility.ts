/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { UserToken, api, post, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

describe('API visibility', () => {
	describe('Note visibility', () => {
		/** ヒロイン */
		let alice: misskey.entities.SignupResponse;
		/** フォロワー */
		let follower: misskey.entities.SignupResponse;
		/** 非フォロワー */
		let other: misskey.entities.SignupResponse;
		/** 非フォロワーでもリプライやメンションをされた人 */
		let target: misskey.entities.SignupResponse;
		let target2: misskey.entities.SignupResponse;

		let pub: misskey.entities.Note;
		let home: misskey.entities.Note;
		let fol: misskey.entities.Note;
		let spe: misskey.entities.Note;

		let pubR: misskey.entities.Note;
		let homeR: misskey.entities.Note;
		let folR: misskey.entities.Note;
		let speR: misskey.entities.Note;

		let pubM: misskey.entities.Note;
		let homeM: misskey.entities.Note;
		let folM: misskey.entities.Note;
		let speM: misskey.entities.Note;

		let tgt: misskey.entities.Note;

		const show = async (noteId: misskey.entities.Note['id'], by?: UserToken) => {
			return await api(
				'notes/show',
				{
					noteId,
				},
				by,
			);
		};

		beforeAll(async () => {
			alice = await signup({ username: 'alice' });
			follower = await signup({ username: 'follower' });
			other = await signup({ username: 'other' });
			target = await signup({ username: 'target' });
			target2 = await signup({ username: 'target2' });

			await api('following/create', { userId: alice.id }, follower);

			pub = await post(alice, { text: 'x', visibility: 'public' });
			home = await post(alice, { text: 'x', visibility: 'home' });
			fol = await post(alice, { text: 'x', visibility: 'followers' });
			spe = await post(alice, { text: 'x', visibility: 'specified', visibleUserIds: [target.id] });

			tgt = await post(target, { text: 'y', visibility: 'public' });
			pubR = await post(alice, { text: 'x', replyId: tgt.id, visibility: 'public' });
			homeR = await post(alice, { text: 'x', replyId: tgt.id, visibility: 'home' });
			folR = await post(alice, { text: 'x', replyId: tgt.id, visibility: 'followers' });
			speR = await post(alice, { text: 'x', replyId: tgt.id, visibility: 'specified' });

			pubM = await post(alice, { text: '@target x', replyId: tgt.id, visibility: 'public' });
			homeM = await post(alice, { text: '@target x', replyId: tgt.id, visibility: 'home' });
			folM = await post(alice, { text: '@target x', replyId: tgt.id, visibility: 'followers' });
			speM = await post(alice, { text: '@target2 x', replyId: tgt.id, visibility: 'specified' });
		});

		test('[show] public-postを自分が見れる', async () => {
			const res = await show(pub.id, alice);
			expect(res.body.text).toBe('x');
		});

		test('[show] public-postをフォロワーが見れる', async () => {
			const res = await show(pub.id, follower);
			expect(res.body.text).toBe('x');
		});

		test('[show] public-postを非フォロワーが見れる', async () => {
			const res = await show(pub.id, other);
			expect(res.body.text).toBe('x');
		});

		test('[show] public-postを未認証が見れる', async () => {
			const res = await show(pub.id);
			expect(res.body.text).toBe('x');
		});

		test('[show] home-postを自分が見れる', async () => {
			const res = await show(home.id, alice);
			expect(res.body.text).toBe('x');
		});

		test('[show] home-postをフォロワーが見れる', async () => {
			const res = await show(home.id, follower);
			expect(res.body.text).toBe('x');
		});

		test('[show] home-postを非フォロワーが見れる', async () => {
			const res = await show(home.id, other);
			expect(res.body.text).toBe('x');
		});

		test('[show] home-postを未認証が見れる', async () => {
			const res = await show(home.id);
			expect(res.body.text).toBe('x');
		});

		test('[show] followers-postを自分が見れる', async () => {
			const res = await show(fol.id, alice);
			expect(res.body.text).toBe('x');
		});

		test('[show] followers-postをフォロワーが見れる', async () => {
			const res = await show(fol.id, follower);
			expect(res.body.text).toBe('x');
		});

		test('[show] followers-postを非フォロワーが見れない', async () => {
			const res = await show(fol.id, other);
			expect(res.body.isHidden).toBe(true);
		});

		test('[show] followers-postを未認証が見れない', async () => {
			const res = await show(fol.id);
			expect(res.body.isHidden).toBe(true);
		});

		test('[show] specified-postを自分が見れる', async () => {
			const res = await show(spe.id, alice);
			expect(res.body.text).toBe('x');
		});

		test('[show] specified-postを指定ユーザーが見れる', async () => {
			const res = await show(spe.id, target);
			expect(res.body.text).toBe('x');
		});

		test('[show] specified-postをフォロワーが見れない', async () => {
			const res = await show(spe.id, follower);
			expect(res.body.isHidden).toBe(true);
		});

		test('[show] specified-postを非フォロワーが見れない', async () => {
			const res = await show(spe.id, other);
			expect(res.body.isHidden).toBe(true);
		});

		test('[show] specified-postを未認証が見れない', async () => {
			const res = await show(spe.id);
			expect(res.body.isHidden).toBe(true);
		});

		test('[show] public-replyを自分が見れる', async () => {
			const res = await show(pubR.id, alice);
			expect(res.body.text).toBe('x');
		});

		test('[show] public-replyをされた人が見れる', async () => {
			const res = await show(pubR.id, target);
			expect(res.body.text).toBe('x');
		});

		test('[show] public-replyをフォロワーが見れる', async () => {
			const res = await show(pubR.id, follower);
			expect(res.body.text).toBe('x');
		});

		test('[show] public-replyを非フォロワーが見れる', async () => {
			const res = await show(pubR.id, other);
			expect(res.body.text).toBe('x');
		});

		test('[show] public-replyを未認証が見れる', async () => {
			const res = await show(pubR.id);
			expect(res.body.text).toBe('x');
		});

		test('[show] home-replyを自分が見れる', async () => {
			const res = await show(homeR.id, alice);
			expect(res.body.text).toBe('x');
		});

		test('[show] home-replyをされた人が見れる', async () => {
			const res = await show(homeR.id, target);
			expect(res.body.text).toBe('x');
		});

		test('[show] home-replyをフォロワーが見れる', async () => {
			const res = await show(homeR.id, follower);
			expect(res.body.text).toBe('x');
		});

		test('[show] home-replyを非フォロワーが見れる', async () => {
			const res = await show(homeR.id, other);
			expect(res.body.text).toBe('x');
		});

		test('[show] home-replyを未認証が見れる', async () => {
			const res = await show(homeR.id);
			expect(res.body.text).toBe('x');
		});

		test('[show] followers-replyを自分が見れる', async () => {
			const res = await show(folR.id, alice);
			expect(res.body.text).toBe('x');
		});

		test('[show] followers-replyを非フォロワーでもリプライされていれば見れる', async () => {
			const res = await show(folR.id, target);
			expect(res.body.text).toBe('x');
		});

		test('[show] followers-replyをフォロワーが見れる', async () => {
			const res = await show(folR.id, follower);
			expect(res.body.text).toBe('x');
		});

		test('[show] followers-replyを非フォロワーが見れない', async () => {
			const res = await show(folR.id, other);
			expect(res.body.isHidden).toBe(true);
		});

		test('[show] followers-replyを未認証が見れない', async () => {
			const res = await show(folR.id);
			expect(res.body.isHidden).toBe(true);
		});

		test('[show] specified-replyを自分が見れる', async () => {
			const res = await show(speR.id, alice);
			expect(res.body.text).toBe('x');
		});

		test('[show] specified-replyを指定ユーザーが見れる', async () => {
			const res = await show(speR.id, target);
			expect(res.body.text).toBe('x');
		});

		test('[show] specified-replyをされた人が指定されてなくても見れる', async () => {
			const res = await show(speR.id, target);
			expect(res.body.text).toBe('x');
		});

		test('[show] specified-replyをフォロワーが見れない', async () => {
			const res = await show(speR.id, follower);
			expect(res.body.isHidden).toBe(true);
		});

		test('[show] specified-replyを非フォロワーが見れない', async () => {
			const res = await show(speR.id, other);
			expect(res.body.isHidden).toBe(true);
		});

		test('[show] specified-replyを未認証が見れない', async () => {
			const res = await show(speR.id);
			expect(res.body.isHidden).toBe(true);
		});

		test('[show] public-mentionを自分が見れる', async () => {
			const res = await show(pubM.id, alice);
			expect(res.body.text).toBe('@target x');
		});

		test('[show] public-mentionをされた人が見れる', async () => {
			const res = await show(pubM.id, target);
			expect(res.body.text).toBe('@target x');
		});

		test('[show] public-mentionをフォロワーが見れる', async () => {
			const res = await show(pubM.id, follower);
			expect(res.body.text).toBe('@target x');
		});

		test('[show] public-mentionを非フォロワーが見れる', async () => {
			const res = await show(pubM.id, other);
			expect(res.body.text).toBe('@target x');
		});

		test('[show] public-mentionを未認証が見れる', async () => {
			const res = await show(pubM.id);
			expect(res.body.text).toBe('@target x');
		});

		test('[show] home-mentionを自分が見れる', async () => {
			const res = await show(homeM.id, alice);
			expect(res.body.text).toBe('@target x');
		});

		test('[show] home-mentionをされた人が見れる', async () => {
			const res = await show(homeM.id, target);
			expect(res.body.text).toBe('@target x');
		});

		test('[show] home-mentionをフォロワーが見れる', async () => {
			const res = await show(homeM.id, follower);
			expect(res.body.text).toBe('@target x');
		});

		test('[show] home-mentionを非フォロワーが見れる', async () => {
			const res = await show(homeM.id, other);
			expect(res.body.text).toBe('@target x');
		});

		test('[show] home-mentionを未認証が見れる', async () => {
			const res = await show(homeM.id);
			expect(res.body.text).toBe('@target x');
		});

		test('[show] followers-mentionを自分が見れる', async () => {
			const res = await show(folM.id, alice);
			expect(res.body.text).toBe('@target x');
		});

		test('[show] followers-mentionをメンションされていれば非フォロワーでも見れる', async () => {
			const res = await show(folM.id, target);
			expect(res.body.text).toBe('@target x');
		});

		test('[show] followers-mentionをフォロワーが見れる', async () => {
			const res = await show(folM.id, follower);
			expect(res.body.text).toBe('@target x');
		});

		test('[show] followers-mentionを非フォロワーが見れない', async () => {
			const res = await show(folM.id, other);
			expect(res.body.isHidden).toBe(true);
		});

		test('[show] followers-mentionを未認証が見れない', async () => {
			const res = await show(folM.id);
			expect(res.body.isHidden).toBe(true);
		});

		test('[show] specified-mentionを自分が見れる', async () => {
			const res = await show(speM.id, alice);
			expect(res.body.text).toBe('@target2 x');
		});

		test('[show] specified-mentionを指定ユーザーが見れる', async () => {
			const res = await show(speM.id, target);
			expect(res.body.text).toBe('@target2 x');
		});

		test('[show] specified-mentionをされた人が指定されてなかったら見れない', async () => {
			const res = await show(speM.id, target2);
			expect(res.body.isHidden).toBe(true);
		});

		test('[show] specified-mentionをフォロワーが見れない', async () => {
			const res = await show(speM.id, follower);
			expect(res.body.isHidden).toBe(true);
		});

		test('[show] specified-mentionを非フォロワーが見れない', async () => {
			const res = await show(speM.id, other);
			expect(res.body.isHidden).toBe(true);
		});

		test('[show] specified-mentionを未認証が見れない', async () => {
			const res = await show(speM.id);
			expect(res.body.isHidden).toBe(true);
		});

		test('[HTL] public-post が 自分が見れる', async () => {
			const res = await api('notes/timeline', { limit: 100 }, alice);
			expect(res.status).toBe(200);
			const notes = res.body.filter((n) => n.id === pub.id);
			expect(notes[0]?.text).toBe('x');
		});

		test('[HTL] public-post が 非フォロワーから見れない', async () => {
			const res = await api('notes/timeline', { limit: 100 }, other);
			expect(res.status).toBe(200);
			const notes = res.body.filter((n) => n.id === pub.id);
			expect(notes.length).toBe(0);
		});

		test('[HTL] followers-post が フォロワーから見れる', async () => {
			const res = await api('notes/timeline', { limit: 100 }, follower);
			expect(res.status).toBe(200);
			const notes = res.body.filter((n) => n.id === fol.id);
			expect(notes[0]?.text).toBe('x');
		});

		test('[replies] followers-reply が フォロワーから見れる', async () => {
			const res = await api('notes/replies', { noteId: tgt.id, limit: 100 }, follower);
			expect(res.status).toBe(200);
			const notes = res.body.filter((n) => n.id === folR.id);
			expect(notes[0]?.text).toBe('x');
		});

		test('[replies] followers-reply が 非フォロワー (リプライ先ではない) から見れない', async () => {
			const res = await api('notes/replies', { noteId: tgt.id, limit: 100 }, other);
			expect(res.status).toBe(200);
			const notes = res.body.filter((n) => n.id === folR.id);
			expect(notes.length).toBe(0);
		});

		test('[replies] followers-reply が 非フォロワー (リプライ先である) から見れる', async () => {
			const res = await api('notes/replies', { noteId: tgt.id, limit: 100 }, target);
			expect(res.status).toBe(200);
			const notes = res.body.filter((n) => n.id === folR.id);
			expect(notes[0]?.text).toBe('x');
		});

		test('[mentions] followers-reply が 非フォロワー (リプライ先である) から見れる', async () => {
			const res = await api('notes/mentions', { limit: 100 }, target);
			expect(res.status).toBe(200);
			const notes = res.body.filter((n) => n.id === folR.id);
			expect(notes[0]?.text).toBe('x');
		});

		test('[mentions] followers-mention が 非フォロワー (メンション先である) から見れる', async () => {
			const res = await api('notes/mentions', { limit: 100 }, target);
			expect(res.status).toBe(200);
			const notes = res.body.filter((n) => n.id === folM.id);
			expect(notes[0]?.text).toBe('@target x');
		});
	});
});
