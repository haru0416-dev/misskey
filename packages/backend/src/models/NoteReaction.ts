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

	// TODO: 対象noteのuserIdを非正規化したい(「受け取ったリアクション一覧」のようなものを(JOIN無しで)実装したいため)

	public reaction: string;
}
