/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';

export class MiBlocking {
	public id: string;

	public blockeeId: MiUser['id'];

	public blockee: MiUser | null;

	public blockerId: MiUser['id'];

	public blocker: MiUser | null;
}
