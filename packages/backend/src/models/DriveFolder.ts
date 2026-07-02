/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';

export class MiDriveFolder {
	public id: string;

	public name: string;

	public userId: MiUser['id'] | null;

	public user: MiUser | null;

	public parentId: MiDriveFolder['id'] | null;

	public parent: MiDriveFolder | null;
}
