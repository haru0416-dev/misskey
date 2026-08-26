/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Chromatic のビジュアル回帰スナップショット中かどうか。
 *
 * 時刻表示やアニメーションを固定して差分を安定させる用途に使う。判定条件は
 * chromatic パッケージの `chromatic/isChromatic` と同じ。7MB の CLI を依存に持たずに
 * 判定だけしたいので同等の実装を置いている。
 */
export default function isChromatic(windowArgument?: Window): boolean {
	const target = windowArgument ?? (typeof window === 'undefined' ? null : window);
	if (target == null) return false;
	return /Chromatic/.test(target.navigator.userAgent) || /chromatic=true/.test(target.location.href);
}
