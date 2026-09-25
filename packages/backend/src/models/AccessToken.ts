/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiUser } from './User.js';

export class MiAccessToken {
	public id: string;

	public lastUsedAt: Date | null;

	public token: string;

	public session: string | null;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public name: string | null;

	public description: string | null;

	public iconUrl: string | null;

	public permission: string[];

	public fetched: boolean;
}
