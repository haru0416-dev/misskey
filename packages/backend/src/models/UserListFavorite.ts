/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';
import { MiUserList } from './UserList.js';

export class MiUserListFavorite {
	public id: string;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public userListId: MiUserList['id'];

	public userList: MiUserList | null;
}
