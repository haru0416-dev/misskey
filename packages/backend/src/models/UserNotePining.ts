/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiNote } from './Note.js';
import { MiUser } from './User.js';

export class MiUserNotePining {
	public id: string;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public noteId: MiNote['id'];

	public note: MiNote | null;
}
