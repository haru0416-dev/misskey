/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiUser } from './User.js';

export class MiSwSubscription {
	public id: string;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public endpoint: string;

	public auth: string;

	public publickey: string;

	public sendReadMessage: boolean;
}
