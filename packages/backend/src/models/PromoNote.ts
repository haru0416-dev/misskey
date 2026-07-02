/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiNote } from './Note.js';
import type { MiUser } from './User.js';

export class MiPromoNote {
	public noteId: MiNote['id'];

	public note: MiNote | null;

	public expiresAt: Date;

	//#region Denormalized fields
	public userId: MiUser['id'];
	//#endregion
}
