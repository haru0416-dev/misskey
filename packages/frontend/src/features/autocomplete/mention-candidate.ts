/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

function isMentionChar(code: number): boolean {
	return (
		(code >= 0x30 && code <= 0x39) ||
		(code >= 0x41 && code <= 0x5a) ||
		(code >= 0x61 && code <= 0x7a) ||
		code === 0x5f ||
		code === 0x40 ||
		code === 0x2e ||
		code === 0x2d
	);
}

/**
 * 行末に続く、メンションに含められる文字 (英数字・_・@・.・-) だけの部分。
 * 入力のたびにカーソル前の行全体へかけるので末尾から遡って読む。非固定の `/[...]+$/` は
 * 途中の各位置から空白の手前まで読み直し、3,000 字の行で 1 打鍵 6.3 ms (長さの 2 乗) かかる。
 */
export function trailingMentionCandidate(text: string): string {
	let start = text.length;
	while (start > 0 && isMentionChar(text.charCodeAt(start - 1))) start--;
	return text.slice(start);
}
