/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';

export class MiChatRoom {
	public id: string;

	public name: string;

	public ownerId: MiUser['id'];

	public owner: MiUser | null;

	public description: string;

	public isArchived: boolean;
}
