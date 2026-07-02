/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';
import { MiAnnouncement } from './Announcement.js';

export class MiAnnouncementRead {
	public id: string;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public announcementId: MiAnnouncement['id'];

	public announcement: MiAnnouncement | null;
}
