/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';

const manualIndex = { unique: false, synchronize: false } as const;

export class MiSignin {
	public id: string;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public ip: string;

	public headers: Record<string, any>;

	public success: boolean;
}
