/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiUser } from './User.js';

// 同じ userId・domain・scope・key の組は DB 制約で一意。domain が null の行も対象になる。
export class MiRegistryItem {
	public id: string;

	public updatedAt: Date;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public key: string;

	public value: any | null;

	public scope: string[];

	public domain: string | null;
}
