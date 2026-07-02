/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';

export class MiPasswordResetRequest {
	public id: string;

	public token: string;

	public userId: MiUser['id'];

	public user: MiUser | null;
}
