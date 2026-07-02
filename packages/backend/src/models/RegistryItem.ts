/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';

// TODO: 同じdomain、同じscope、同じkeyのレコードは二つ以上存在しないように制約付けたい
export class MiRegistryItem {
	public id: string;

	public updatedAt: Date;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public key: string;

	public value: any | null;

	public scope: string[];

	// サードパーティアプリに開放するときのためのカラム
	public domain: string | null;
}
