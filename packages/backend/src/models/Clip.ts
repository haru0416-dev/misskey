/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';

export class MiClip {
	public id: string;

	public lastClippedAt: Date | null;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public name: string;

	public isPublic: boolean;

	public description: string | null;
}
