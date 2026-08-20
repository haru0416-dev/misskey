/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ipaddr from 'ipaddr.js';

function ipPrefixBits(ip: string, bits: number): string {
	const binary = ipaddr
		.parse(ip)
		.toByteArray()
		.map((byte) => byte.toString(2).padStart(8, '0'))
		.join('');
	return binary.slice(0, bits);
}

export function getIpHash(ip: string): string {
	try {
		// 1人が複数の IPv6 アドレスを使えるため、どの IP でも /64 のサブネット接頭辞だけを使う。
		// IPv4 ではアドレス全体が対象になる。
		const prefix = ipPrefixBits(ip, 64);
		return 'ip-' + BigInt('0b' + prefix).toString(36);
	} catch (_) {
		const prefix = ipPrefixBits(ip.replace(/:[0-9]+$/, ''), 64);
		return 'ip-' + BigInt('0b' + prefix).toString(36);
	}
}
