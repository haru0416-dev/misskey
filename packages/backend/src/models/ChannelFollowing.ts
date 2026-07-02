/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';
import { MiChannel } from './Channel.js';

export class MiChannelFollowing {
	public id: string;

	public followeeId: MiChannel['id'];

	public followee: MiChannel | null;

	public followerId: MiUser['id'];

	public follower: MiUser | null;
}
