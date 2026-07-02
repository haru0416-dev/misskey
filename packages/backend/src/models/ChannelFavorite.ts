/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';
import { MiChannel } from './Channel.js';

export class MiChannelFavorite {
	public id: string;

	public channelId: MiChannel['id'];

	public channel: MiChannel | null;

	public userId: MiUser['id'];

	public user: MiUser | null;
}
