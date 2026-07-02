/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';
import type { MiDriveFile } from './DriveFile.js';

export class MiGalleryPost {
	public id: string;

	public updatedAt: Date;

	public title: string;

	public description: string | null;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public fileIds: MiDriveFile['id'][];

	public isSensitive: boolean;

	public likedCount: number;

	public tags: string[];

	constructor(data: Partial<MiGalleryPost>) {
		if (data == null) return;

		for (const [k, v] of Object.entries(data)) {
			(this as any)[k] = v;
		}
	}
}
