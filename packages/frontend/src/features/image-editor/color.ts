/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// シェーダーへ渡す色は各成分 0〜1 の RGB。<input type="color"> の #rrggbb と相互変換する。
export function rgbToHex(c: [number, number, number]) {
	return `#${c
		.map((x) =>
			Math.round(x * 255)
				.toString(16)
				.padStart(2, '0'),
		)
		.join('')}`;
}

export function hexToRgb(hex: string | number): [number, number, number] | null {
	if (typeof hex === 'number' || typeof hex !== 'string' || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) {
		return null;
	}

	const m = hex.slice(1).match(/[0-9a-fA-F]{2}/g);
	if (m == null) {
		return [0, 0, 0];
	}
	return m.map((x) => Number.parseInt(x, 16) / 255) as [number, number, number];
}
