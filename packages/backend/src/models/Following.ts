/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';

export class MiFollowing {
	public id: string;

	public followeeId: MiUser['id'];

	public followee: MiUser | null;

	public followerId: MiUser['id'];

	public follower: MiUser | null;

	public isFollowerHibernated: boolean;

	public withReplies: boolean;

	public notify: 'normal' | null;

	public followerHost: string | null;

	public followerInbox: string | null;

	public followerSharedInbox: string | null;

	public followeeHost: string | null;

	public followeeInbox: string | null;

	public followeeSharedInbox: string | null;
}
