/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';
import { MiChannel } from './Channel.js';

const manualUniqueIndex = { unique: true, synchronize: false } as const;

export class MiChannelMuting {
	public id: string;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public channelId: MiChannel['id'];

	public channel: MiChannel | null;

	public expiresAt: Date | null;
}
