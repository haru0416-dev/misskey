/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class MiAvatarDecoration {
	public id: string;

	public updatedAt: Date | null;

	public url: string;

	public name: string;

	public description: string;

	// 削除済みロールの ID が残る場合がある。
	public roleIdsThatCanBeUsedThisDecoration: string[];

	public category: string | null;
}
