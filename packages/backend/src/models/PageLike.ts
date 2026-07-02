/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';
import { MiPage } from './Page.js';

export class MiPageLike {
	public id: string;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public pageId: MiPage['id'];

	public page: MiPage | null;
}
