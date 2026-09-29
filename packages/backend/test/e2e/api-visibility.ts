/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeAll, describe, expect, test } from 'vitest';
import { api, post, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

describe('API visibility', () => {
	describe('Note visibility', () => {
		let alice: misskey.entities.SignupResponse;
		let follower: misskey.entities.SignupResponse;
		let other: misskey.entities.SignupResponse;
		/** 非フォロワーでもリプライやメンションをされた人 */
		let target: misskey.entities.SignupResponse;
		let target2: misskey.entities.SignupResponse;

		let tgt: misskey.entities.Note;
		const posted: Record<'pub' | 'home' | 'fol' | 'spe' | 'folR' | 'speR' | 'folM' | 'speM', misskey.entities.Note> =
			{} as never;

		beforeAll(async () => {
			alice = await signup({ username: 'alice' });
			follower = await signup({ username: 'follower' });
			other = await signup({ username: 'other' });
			target = await signup({ username: 'target' });
			target2 = await signup({ username: 'target2' });

			await api('following/create', { userId: alice.id }, follower);

			posted.pub = await post(alice, { text: 'x', visibility: 'public' });
			posted.home = await post(alice, { text: 'x', visibility: 'home' });
			posted.fol = await post(alice, { text: 'x', visibility: 'followers' });
			posted.spe = await post(alice, { text: 'x', visibility: 'specified', visibleUserIds: [target.id] });

			tgt = await post(target, { text: 'y', visibility: 'public' });
			posted.folR = await post(alice, { text: 'x', replyId: tgt.id, visibility: 'followers' });
			// リプライ先は visibleUserIds に自動で入る
			posted.speR = await post(alice, { text: 'x', replyId: tgt.id, visibility: 'specified' });

			// リプライにするとリプライ先の分岐で見えてしまい、メンションの分岐を踏まない
			posted.folM = await post(alice, { text: '@target x', visibility: 'followers' });
			// メンションだけでは visibleUserIds に入らない
			posted.speM = await post(alice, { text: '@target2 x', replyId: tgt.id, visibility: 'specified' });
		});

		type Viewer = 'alice' | 'follower' | 'other' | 'target' | 'target2' | 'anonymous';
		const viewerToken = (viewer: Viewer) => ({ alice, follower, other, target, target2, anonymous: undefined })[viewer];

		// public と home は閲覧者を問わず見えるので、閲覧者の条件が最も弱い非フォロワーと未認証だけを見る。
		test.each<[keyof typeof posted, Viewer, boolean]>([
			['pub', 'other', true],
			['pub', 'anonymous', true],
			['home', 'other', true],
			['home', 'anonymous', true],
			['fol', 'alice', true],
			['fol', 'follower', true],
			['fol', 'other', false],
			['fol', 'anonymous', false],
			['spe', 'alice', true],
			['spe', 'target', true],
			['spe', 'follower', false],
			['spe', 'other', false],
			['spe', 'anonymous', false],
			['folR', 'target', true],
			['folR', 'other', false],
			['speR', 'target', true],
			['speR', 'follower', false],
			['folM', 'target', true],
			['folM', 'other', false],
			['speM', 'target', true],
			['speM', 'target2', false],
		])('[show] %s を %s が見れる: %s', async (key, viewer, visible) => {
			const note = posted[key];
			const res = await api('notes/show', { noteId: note.id }, viewerToken(viewer));
			expect(res.status).toBe(200);
			if (visible) {
				expect(res.body.text).toBe(note.text);
				expect(res.body.isHidden).toBeUndefined();
			} else {
				expect(res.body.isHidden).toBe(true);
				expect(res.body.text).toBeNull();
			}
		});

		test('[replies] followers-reply が フォロワーから見れる', async () => {
			const res = await api('notes/replies', { noteId: tgt.id, limit: 100 }, follower);
			expect(res.status).toBe(200);
			const notes = res.body.filter((n) => n.id === posted.folR.id);
			expect(notes[0]?.text).toBe('x');
		});

		test('[replies] followers-reply が 非フォロワー (リプライ先ではない) から見れない', async () => {
			const res = await api('notes/replies', { noteId: tgt.id, limit: 100 }, other);
			expect(res.status).toBe(200);
			const notes = res.body.filter((n) => n.id === posted.folR.id);
			expect(notes).toHaveLength(0);
		});

		test('[replies] followers-reply が 非フォロワー (リプライ先である) から見れる', async () => {
			const res = await api('notes/replies', { noteId: tgt.id, limit: 100 }, target);
			expect(res.status).toBe(200);
			const notes = res.body.filter((n) => n.id === posted.folR.id);
			expect(notes[0]?.text).toBe('x');
		});

		test('[mentions] followers-reply が 非フォロワー (リプライ先である) から見れる', async () => {
			const res = await api('notes/mentions', { limit: 100 }, target);
			expect(res.status).toBe(200);
			const notes = res.body.filter((n) => n.id === posted.folR.id);
			expect(notes[0]?.text).toBe('x');
		});

		test('[mentions] followers-mention が 非フォロワー (メンション先である) から見れる', async () => {
			const res = await api('notes/mentions', { limit: 100 }, target);
			expect(res.status).toBe(200);
			const notes = res.body.filter((n) => n.id === posted.folM.id);
			expect(notes[0]?.text).toBe('@target x');
		});
	});
});
