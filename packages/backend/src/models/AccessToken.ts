/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';
import { MiApp } from './App.js';

export class MiAccessToken {
	public id: string;

	public lastUsedAt: Date | null;

	public token: string;

	public session: string | null;

	public hash: string;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public appId: MiApp['id'] | null;

	public app: MiApp | null;

	public name: string | null;

	public description: string | null;

	public iconUrl: string | null;

	public permission: string[];

	public fetched: boolean;
}
