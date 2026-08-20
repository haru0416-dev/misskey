/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';
import { MiUserList } from './UserList.js';

export class MiAntenna {
	public id: string;

	public lastUsedAt: Date;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public name: string;

	public src: 'home' | 'all' | 'users' | 'list' | 'users_blacklist';

	public userListId: MiUserList['id'] | null;

	public userList: MiUserList | null;

	public users: string[];

	public keywords: string[][];

	public excludeKeywords: string[][];

	public caseSensitive: boolean;

	public excludeBots: boolean;

	public withReplies: boolean;

	public withFile: boolean;

	public expression: string | null;

	public isActive: boolean;

	public localOnly: boolean;

	public excludeNotesInSensitiveChannel: boolean;
}
// カラムを追加する場合は、ExportAntennaProcessorService と ImportAntennaProcessorService の
// エクスポート・インポート対象も更新する。
