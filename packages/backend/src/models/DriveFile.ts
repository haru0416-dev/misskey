/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';
import { MiDriveFolder } from './DriveFolder.js';

export class MiDriveFile {
	public id: string;

	public userId: MiUser['id'] | null;

	public user: MiUser | null;

	public userHost: string | null;

	public md5: string;

	public name: string;

	public type: string;

	public size: number;

	public comment: string | null;

	public blurhash: string | null;

	public properties: { width?: number; height?: number; orientation?: number; avgColor?: string };

	public storedInternal: boolean;

	public url: string;

	public thumbnailUrl: string | null;

	public webpublicUrl: string | null;

	public webpublicType: string | null;

	public accessKey: string | null;

	public thumbnailAccessKey: string | null;

	public webpublicAccessKey: string | null;

	public uri: string | null;

	public src: string | null;

	public folderId: MiDriveFolder['id'] | null;

	public folder: MiDriveFolder | null;

	public isSensitive: boolean;

	public maybeSensitive: boolean;

	public maybePorn: boolean;

	/**
	 * 外部の(信頼されていない)URLへの直リンクか否か
	 */
	public isLink: boolean;

	public requestHeaders: Record<string, string> | null;

	public requestIp: string | null;
}
