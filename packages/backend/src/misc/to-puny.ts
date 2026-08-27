/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII } from 'node:url';

/**
 * ホスト名を DB とリモートとのやり取りで使う形 (小文字の Punycode) に正規化する。
 *
 * `domainToASCII` は UTS #46 に従うので、大小の統一と IDN の変換に加えて、
 * ホスト名として使えない文字を含む入力を空文字列にする。呼び出し側はホストが
 * 空になりうることを前提にすること。
 */
export function toPuny(host: string): string {
	return domainToASCII(host.toLowerCase());
}

export function toPunyNullable(host: string | null | undefined): string | null {
	if (host == null) return null;
	return toPuny(host);
}
