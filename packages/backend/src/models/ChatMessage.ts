/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';
import { MiDriveFile } from './DriveFile.js';
import { MiChatRoom } from './ChatRoom.js';

export class MiChatMessage {
	public id: string;

	public fromUserId: MiUser['id'];

	public fromUser: MiUser | null;

	public toUserId: MiUser['id'] | null;

	public toUser: MiUser | null;

	public toRoomId: MiChatRoom['id'] | null;

	public toRoom: MiChatRoom | null;

	public text: string | null;

	public uri: string | null;

	public reads: MiUser['id'][];

	public fileId: MiDriveFile['id'] | null;

	public file: MiDriveFile | null;

	public reactions: string[];
}
