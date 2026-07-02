/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';

export class MiMuting {
	public id: string;

	public expiresAt: Date | null;

	public muteeId: MiUser['id'];

	public mutee: MiUser | null;

	public muterId: MiUser['id'];

	public muter: MiUser | null;
}
