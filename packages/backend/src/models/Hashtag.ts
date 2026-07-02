/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiUser } from './User.js';

export class MiHashtag {
	public id: string;

	public name: string;

	public mentionedUserIds: MiUser['id'][];

	public mentionedUsersCount: number;

	public mentionedLocalUserIds: MiUser['id'][];

	public mentionedLocalUsersCount: number;

	public mentionedRemoteUserIds: MiUser['id'][];

	public mentionedRemoteUsersCount: number;

	public attachedUserIds: MiUser['id'][];

	public attachedUsersCount: number;

	public attachedLocalUserIds: MiUser['id'][];

	public attachedLocalUsersCount: number;

	public attachedRemoteUserIds: MiUser['id'][];

	public attachedRemoteUsersCount: number;
}
