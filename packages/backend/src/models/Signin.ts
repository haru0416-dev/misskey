/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiUser } from './User.js';

export class MiSignin {
	public id: string;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public ip: string;

	public headers: Record<string, unknown>;

	public success: boolean;
}
