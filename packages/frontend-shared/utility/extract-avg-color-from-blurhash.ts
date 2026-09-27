/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const base83 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';

export function extractAvgColorFromBlurhash(hash: string) {
	if (typeof hash !== 'string') {
		return undefined;
	}
	let color = 0;
	for (const char of hash.slice(2, 6)) {
		color = color * 83 + base83.indexOf(char);
	}
	return '#' + color.toString(16).padStart(6, '0');
}
