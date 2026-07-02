/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';

const manualIndex = { unique: false, synchronize: false } as const;

export class MiModerationLog {
	public id: string;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public type: string;

	public info: Record<string, any>;
}
