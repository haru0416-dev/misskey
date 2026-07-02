/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';
import { MiDriveFile } from './DriveFile.js';

export class MiChannel {
	public id: string;

	public lastNotedAt: Date | null;

	public userId: MiUser['id'] | null;

	public user: MiUser | null;

	public name: string;

	public description: string | null;

	public bannerId: MiDriveFile['id'] | null;

	public banner: MiDriveFile | null;

	public pinnedNoteIds: string[];

	public color: string;

	public isArchived: boolean;

	public notesCount: number;

	public usersCount: number;

	public isSensitive: boolean;

	public allowRenoteToExternal: boolean;
}
