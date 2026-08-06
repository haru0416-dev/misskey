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
		// because a single person may control many IPv6 addresses,
		// only a /64 subnet prefix of any IP will be taken into account.
		// (this means for IPv4 the entire address is used)
		const prefix = ipPrefixBits(ip, 64);
		return 'ip-' + BigInt('0b' + prefix).toString(36);
	} catch (_) {
		const prefix = ipPrefixBits(ip.replace(/:[0-9]+$/, ''), 64);
		return 'ip-' + BigInt('0b' + prefix).toString(36);
	}
}
