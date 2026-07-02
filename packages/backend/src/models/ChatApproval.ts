/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';

export class MiChatApproval {
	public id: string;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public otherId: MiUser['id'];

	public other: MiUser | null;
}
