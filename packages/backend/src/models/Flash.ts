/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';

export const flashVisibility = ['public', 'private'] as const;
export type FlashVisibility = typeof flashVisibility[number];

export class MiFlash {
	public id: string;

	public updatedAt: Date;

	public title: string;

	public summary: string;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public script: string;

	public permissions: string[];

	public likedCount: number;

	/**
	 * public ... 公開
	 * private ... プロフィールには表示しない
	 */
	public visibility: FlashVisibility;
}
