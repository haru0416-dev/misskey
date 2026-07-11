/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';

export type AbuseReportResolveType = 'accept' | 'reject';

const manualIndex = { unique: false, synchronize: false } as const;

export class MiAbuseUserReport {
	public id: string;

	public targetUserId: MiUser['id'];

	public targetUser: MiUser | null;

	public reporterId: MiUser['id'];

	public reporter: MiUser | null;

	public assigneeId: MiUser['id'] | null;

	public assignee: MiUser | null;

	public resolved: boolean;

	/**
	 * リモートサーバーに転送したかどうか
	 */
	public forwarded: boolean;

	public comment: string;

	public moderationNote: string;

	/**
	 * accept 是認 ... 通報内容が正当であり、肯定的に対応された
	 * reject 否認 ... 通報内容が正当でなく、否定的に対応された
	 * null ... その他
	 */
	public resolvedAs: AbuseReportResolveType | null;

	public targetUserHost: string | null;

	public reporterHost: string | null;
}
