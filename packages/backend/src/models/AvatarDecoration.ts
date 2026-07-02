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

	// TODO: 定期ジョブで存在しなくなったロールIDを除去するようにする
	public roleIdsThatCanBeUsedThisDecoration: string[];

	public category: string | null;
}
