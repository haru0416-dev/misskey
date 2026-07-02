/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';
import { MiFlash } from './Flash.js';

export class MiFlashLike {
	public id: string;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public flashId: MiFlash['id'];

	public flash: MiFlash | null;
}
