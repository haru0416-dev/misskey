/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';

export class MiRegistrationTicket {
	public id: string;

	public code: string;

	public expiresAt: Date | null;

	public createdBy: MiUser | null;

	public createdById: MiUser['id'] | null;

	public usedBy: MiUser | null;

	public usedById: MiUser['id'] | null;

	public usedAt: Date | null;

	public pendingUserId: string | null;
}
