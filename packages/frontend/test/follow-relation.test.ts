/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { getFollowRelationBadge } from '@/features/users/follow-relation.js';

const me = { id: 'me' };

describe('getFollowRelationBadge', () => {
	test('両方向なら相互', () => {
		expect(getFollowRelationBadge(me, { id: 'other', isFollowing: true, isFollowed: true })).toBe('mutual');
	});

	test('相手からだけなら followsYou', () => {
		expect(getFollowRelationBadge(me, { id: 'other', isFollowing: false, isFollowed: true })).toBe('followsYou');
	});

	test('自分からだけなら出さない', () => {
		expect(getFollowRelationBadge(me, { id: 'other', isFollowing: true, isFollowed: false })).toBeNull();
	});

	test('未ログインでは出さない', () => {
		expect(getFollowRelationBadge(null, { id: 'other', isFollowing: true, isFollowed: true })).toBeNull();
	});

	test('自分自身には出さない', () => {
		expect(getFollowRelationBadge(me, { id: 'me', isFollowing: true, isFollowed: true })).toBeNull();
	});
});
