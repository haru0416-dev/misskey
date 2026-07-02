/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiRole } from './Role.js';
import { MiUser } from './User.js';

export class MiRoleAssignment {
	public id: string;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public roleId: MiRole['id'];

	public role: MiRole | null;

	public expiresAt: Date | null;
}
