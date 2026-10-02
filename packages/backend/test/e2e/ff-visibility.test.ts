/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeAll, describe, expect, test } from 'vitest';
import { api, castAsError, signup, simpleGet } from '../utils.js';
import type * as misskey from 'misskey-js';

describe('FF visibility', () => {
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	/** 一覧を見られる側。最初に登録した alice は root で、モデレーターとして公開範囲を素通りするので使わない */
	let owner: misskey.entities.SignupResponse;
	let follower: misskey.entities.SignupResponse;

	beforeAll(
		async () => {
			alice = await signup({ username: 'alice' });
			bob = await signup({ username: 'bob' });
			owner = await signup({ username: 'carol' });
			follower = await signup({ username: 'dave' });
			await api('following/create', { userId: owner.id }, follower);
			await api('admin/update-meta', { federation: 'all' }, alice as misskey.entities.SignupResponse);
		},
		1000 * 60 * 2,
	);

	type Visibility = 'public' | 'followers' | 'private';
	type Viewer = 'self' | 'follower' | 'nonFollower';

	// 見る側の設定と逆の結果になる値をもう一方の設定に入れ、読む設定を取り違えると落ちるようにしている。
	test.each<['following' | 'followers', Visibility, Visibility, Viewer, 200 | 400]>([
		['following', 'public', 'private', 'nonFollower', 200],
		['following', 'followers', 'private', 'self', 200],
		['following', 'followers', 'private', 'follower', 200],
		['following', 'followers', 'public', 'nonFollower', 400],
		['following', 'private', 'public', 'self', 200],
		['following', 'private', 'public', 'follower', 400],
		['followers', 'public', 'private', 'nonFollower', 200],
		['followers', 'followers', 'private', 'self', 200],
		['followers', 'followers', 'private', 'follower', 200],
		['followers', 'followers', 'public', 'nonFollower', 400],
		['followers', 'private', 'public', 'self', 200],
		['followers', 'private', 'public', 'follower', 400],
	])('users/%s: 見る側の設定 %s・もう一方 %s を %s が見ると %i', async (kind, target, other, viewer, status) => {
		await api(
			'i/update',
			kind === 'following'
				? { followingVisibility: target, followersVisibility: other }
				: { followingVisibility: other, followersVisibility: target },
			owner,
		);

		const res = await api(`users/${kind}`, { userId: owner.id }, { self: owner, follower, nonFollower: bob }[viewer]);
		expect(res.status).toBe(status);
		if (status === 200) {
			expect(Array.isArray(res.body)).toBe(true);
		} else {
			expect(castAsError(res.body).error.code).toBe('FORBIDDEN');
		}
	});

	describe('AP', () => {
		test('followingVisibility が public 以外ならばAPからはフォローを取得できない', async () => {
			{
				await api(
					'i/update',
					{
						followingVisibility: 'public',
					},
					alice,
				);

				const followingRes = await simpleGet(`/users/${alice.id}/following`, 'application/activity+json');
				expect(followingRes.status).toBe(200);
			}
			{
				await api(
					'i/update',
					{
						followingVisibility: 'followers',
					},
					alice,
				);

				const followingRes = await simpleGet(`/users/${alice.id}/following`, 'application/activity+json');
				expect(followingRes.status).toBe(403);
			}
			{
				await api(
					'i/update',
					{
						followingVisibility: 'private',
					},
					alice,
				);

				const followingRes = await simpleGet(`/users/${alice.id}/following`, 'application/activity+json');
				expect(followingRes.status).toBe(403);
			}
		});

		test('followersVisibility が public 以外ならばAPからはフォロワーを取得できない', async () => {
			{
				await api(
					'i/update',
					{
						followersVisibility: 'public',
					},
					alice,
				);

				const followersRes = await simpleGet(`/users/${alice.id}/followers`, 'application/activity+json');
				expect(followersRes.status).toBe(200);
			}
			{
				await api(
					'i/update',
					{
						followersVisibility: 'followers',
					},
					alice,
				);

				const followersRes = await simpleGet(`/users/${alice.id}/followers`, 'application/activity+json');
				expect(followersRes.status).toBe(403);
			}
			{
				await api(
					'i/update',
					{
						followersVisibility: 'private',
					},
					alice,
				);

				const followersRes = await simpleGet(`/users/${alice.id}/followers`, 'application/activity+json');
				expect(followersRes.status).toBe(403);
			}
		});
	});
});
