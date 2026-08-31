/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';

// (domain, scope, key) の一意性は DB 制約で保証されていない。
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
