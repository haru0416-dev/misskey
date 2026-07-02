/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';

export class MiApp {
	public id: string;

	public userId: MiUser['id'] | null;

	public user: MiUser | null;

	public secret: string;

	public name: string;

	public description: string;

	public permission: string[];

	public callbackUrl: string | null;
}
