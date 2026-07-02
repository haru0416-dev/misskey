/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';

export class MiUserSecurityKey {
	public id: string;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public name: string;

	public publicKey: string;

	public counter: number;

	public lastUsed: Date;

	public credentialDeviceType: string | null;

	public credentialBackedUp: boolean | null;

	public transports: string[] | null;

	constructor(data: Partial<MiUserSecurityKey>) {
		if (data == null) return;

		for (const [k, v] of Object.entries(data)) {
			(this as any)[k] = v;
		}
	}
}
