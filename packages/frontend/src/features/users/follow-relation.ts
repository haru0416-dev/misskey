/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';

export type FollowRelationBadge = 'mutual' | 'followsYou' | null;

/**
 * プロフィールに出すフォロー関係のバッジ。
 * `isFollowing` / `isFollowed` は自分向けに詰められるので、未ログインや自分自身では入らない。
 */
export function getFollowRelationBadge(
	me: { id: string } | null | undefined,
	user: Pick<Misskey.entities.UserDetailed, 'id'> & { isFollowing?: boolean; isFollowed?: boolean },
): FollowRelationBadge {
	if (me == null || me.id === user.id) return null;
	if (!user.isFollowed) return null;
	return user.isFollowing ? 'mutual' : 'followsYou';
}
