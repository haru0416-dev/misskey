/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';
import { MiApp } from './App.js';

export class MiAuthSession {
	public id: string;

	public token: string;

	public userId: MiUser['id'] | null;

	public user: MiUser | null;

	public appId: MiApp['id'];

	public app: MiApp | null;
}
