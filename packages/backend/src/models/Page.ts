/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';
import { MiDriveFile } from './DriveFile.js';

export class MiPage {
	public id: string;

	public updatedAt: Date;

	public title: string;

	public name: string;

	public summary: string | null;

	public alignCenter: boolean;

	public hideTitleWhenPinned: boolean;

	public font: 'serif' | 'sans-serif';

	public userId: MiUser['id'];

	public user: MiUser | null;

	public eyeCatchingImageId: MiDriveFile['id'] | null;

	public eyeCatchingImage: MiDriveFile | null;

	public content: Record<string, any>[];

	public variables: Record<string, any>[];

	public script: string;

	/**
	 * public ... 公開
	 * followers ... フォロワーのみ
	 * specified ... visibleUserIds で指定したユーザーのみ
	 */
	public visibility: 'public' | 'followers' | 'specified';

	public visibleUserIds: MiUser['id'][];

	public likedCount: number;

	constructor(data: Partial<MiPage>) {
		if (data == null) return;

		for (const [k, v] of Object.entries(data)) {
			(this as any)[k] = v;
		}
	}
}

export const pageNameSchema = { type: 'string', pattern: /^[^\s:\/?#\[\]@!$&'()*+,;=\\%\x00-\x20]{1,256}$/.source } as const;
