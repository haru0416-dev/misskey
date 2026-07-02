/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';

export class MiUserKeypair {
	public userId: MiUser['id'];

	public user: MiUser | null;

	public publicKey: string;

	public privateKey: string;

	constructor(data: Partial<MiUserKeypair>) {
		if (data == null) return;

		for (const [k, v] of Object.entries(data)) {
			(this as any)[k] = v;
		}
	}
}
