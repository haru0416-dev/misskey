/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 絵文字ピッカーはローカルのカスタム絵文字を `:name@.:` で返すが、サーバーは `:name:` で持つ。
 * 楽観的に足すキーを合わせないと、再取得まで同じ絵文字が 2 行に分かれる。
 */
export function toStoredAnnouncementReaction(reaction: string): string {
	return reaction.replace('@.:', ':');
}
