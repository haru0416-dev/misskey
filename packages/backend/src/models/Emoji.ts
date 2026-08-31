/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class MiEmoji {
	public id: string;

	public updatedAt: Date | null;

	public name: string;

	public host: string | null;

	public category: string | null;

	public originalUrl: string;

	public publicUrl: string;

	public uri: string | null;

	// type は originalUrl ではなく publicUrl の MIME type。
	public type: string | null;

	public aliases: string[];

	public license: string | null;

	public localOnly: boolean;

	public isSensitive: boolean;

	// 削除済みロールの ID が残る場合がある。
	public roleIdsThatCanBeUsedThisEmojiAsReaction: string[];
}
