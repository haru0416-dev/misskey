/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';
import { MiNote } from './Note.js';

export class MiNoteReaction {
	public id: string;

	public userId: MiUser['id'];

	public user?: MiUser | null;

	public noteId: MiNote['id'];

	public note?: MiNote | null;

	public reaction: string;
}
