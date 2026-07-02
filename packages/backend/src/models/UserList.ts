/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';

export class MiUserList {
	public id: string;

	public userId: MiUser['id'];

	public isPublic: boolean;

	public user: MiUser | null;

	public name: string;
}
