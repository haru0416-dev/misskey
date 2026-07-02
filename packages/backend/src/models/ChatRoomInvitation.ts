/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';
import { MiChatRoom } from './ChatRoom.js';

export class MiChatRoomInvitation {
	public id: string;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public roomId: MiChatRoom['id'];

	public room: MiChatRoom | null;

	public ignored: boolean;
}
