/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiUser } from './User.js';

export class MiUserIp {
	public id: string;

	public createdAt: Date;

	public userId: MiUser['id'];

	public ip: string;
}
