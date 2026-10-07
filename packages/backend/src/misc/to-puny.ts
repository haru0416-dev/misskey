/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII } from 'node:url';

// `URL.host` の形 (ホスト名、角括弧付きの IPv6、任意のポート)。
const HOST_WITH_PORT = /^(\[[^\]]*\]|[^:]*)(?::(\d+))?$/;

/**
 * ホスト (`URL.host` の形。ポートを含んでよい) を DB とリモートとのやり取りで使う形 (小文字の Punycode) に正規化する。
 *
 * `domainToASCII` は UTS #46 に従うので、大小の統一と IDN の変換に加えて、
 * ホスト名として使えない文字を含む入力を空文字列にする。呼び出し側はホストが
 * 空になりうることを前提にすること。
 * `domainToASCII` はポート付きの入力も空文字列にする。ポート付きのホストどうしが同じ空文字列になると、
 * 自ホストの判定や連合の許可判定で別のホストを取り違えるため、ホスト名だけを変換してポートを残す。
 */
export function toPuny(host: string): string {
	const lower = host.toLowerCase();
	const parts = splitHostPort(lower);
	if (parts == null) {
		return domainToASCII(lower);
	}
	const hostname = domainToASCII(parts.hostname);
	if (hostname === '' || parts.port == null) {
		return hostname;
	}
	return `${hostname}:${parts.port}`;
}

/**
 * `URL.host` の形のホストをホスト名とポートに分ける。文字の変換はしない。形が合わなければ null。
 */
export function splitHostPort(host: string): { hostname: string; port: string | null } | null {
	const match = HOST_WITH_PORT.exec(host);
	if (match == null) {
		return null;
	}
	return { hostname: match[1]!, port: match[2] ?? null };
}

export function toPunyNullable(host: string | null | undefined): string | null {
	if (host == null) {
		return null;
	}
	return toPuny(host);
}
