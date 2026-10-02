/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const ZERO_WIDTH_JOINER = '‍';
const VARIATION_SELECTOR_16 = /️/g;

/**
 * ピッカーが返す文字列を、サーバーが保存する形へ揃える。
 * 保存形と表示形がずれると同じ絵文字が 2 行に分かれ、付け外しも噛み合わなくなる。
 *
 * サーバー側 (`normalizeReaction`) に合わせて 2 つを行う。
 *
 * - ローカルのカスタム絵文字はピッカーが `:name@.:` を返すが、保存は `:name:`
 * - Unicode 絵文字は異体字セレクタ (U+FE0F) を落とす。ただし ZWJ を含む場合は保持する
 */
export function toStoredAnnouncementReaction(reaction: string): string {
	const withoutHost = reaction.replace('@.:', ':');
	if (withoutHost.startsWith(':')) {
		return withoutHost;
	}
	if (withoutHost.includes(ZERO_WIDTH_JOINER)) {
		return withoutHost;
	}
	return withoutHost.replaceAll(VARIATION_SELECTOR_16, '');
}
