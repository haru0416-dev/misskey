/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';

export class MiUserPublickey {
	public userId: MiUser['id'];

	public user: MiUser | null;

	public keyId: string;

	public keyPem: string;

	constructor(data: Partial<MiUserPublickey>) {
		if (data == null) return;

		for (const [k, v] of Object.entries(data)) {
			(this as Record<string, unknown>)[k] = v;
		}
	}
}
