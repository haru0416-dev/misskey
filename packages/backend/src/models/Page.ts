/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';
import { MiDriveFile } from './DriveFile.js';

/**
 * Pages のコンテンツブロック。ブロック種別 (text/image/input/section 等) ごとにプロパティが異なる
 * 動的な構造のため、実際に参照・代入されるフィールドのみ緩く型付けし、その他は unknown として素通しする。
 */
export type MiPageContentBlock = {
	type?: string;
	fileId?: string;
	children?: MiPageContentBlock[];
	inputType?: string;
	default?: unknown;
	[key: string]: unknown;
};

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

	public content: MiPageContentBlock[];

	public variables: MiPageContentBlock[];

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
			(this as Record<string, unknown>)[k] = v;
		}
	}
}

export const pageNameSchema = {
	type: 'string',
	pattern: /^[^\s:\/?#\[\]@!$&'()*+,;=\\%\x00-\x20]{1,256}$/.source,
} as const;
