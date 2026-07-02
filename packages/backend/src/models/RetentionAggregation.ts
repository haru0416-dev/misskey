/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiUser } from './User.js';

export class MiRetentionAggregation {
	public id: string;

	public createdAt: Date;

	public updatedAt: Date;

	public dateKey: string;

	public userIds: MiUser['id'][];

	public usersCount: number;

	public data: Record<string, number>;
}
