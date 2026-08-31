/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';

export class MiAnnouncement {
	public id: string;

	public updatedAt: Date | null;

	public text: string;

	public title: string;

	public imageUrl: string | null;

	public icon: 'info' | 'warning' | 'error' | 'success';

	// normal=一覧のみ、banner=一覧とバナー、dialog=一覧とダイアログ。
	public display: 'normal' | 'banner' | 'dialog';

	public needConfirmationToRead: boolean;

	public isActive: boolean;

	public forExistingUsers: boolean;

	public silence: boolean;

	public userId: MiUser['id'] | null;

	public user: MiUser | null;

	constructor(data: Partial<MiAnnouncement>) {
		if (data == null) return;

		for (const [k, v] of Object.entries(data)) {
			(this as Record<string, unknown>)[k] = v;
		}
	}
}
