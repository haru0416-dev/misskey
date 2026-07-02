/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';

const manualUniqueIndex = { unique: true, synchronize: false } as const;

export class MiSwSubscription {
	public id: string;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public endpoint: string;

	public auth: string;

	public publickey: string;

	public sendReadMessage: boolean;
}
