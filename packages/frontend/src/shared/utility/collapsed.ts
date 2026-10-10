/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';

// 畳んだときは 8 行 (--MI-collapsed-height) を見せる。改行が その φ 倍の 13 行を超えるときだけ畳み、
// 隠れる部分を 5 行以上にする。文字数の上限は、英字が最も多く入る広い本文幅 (1 行約 100 字) でも
// 8 行を超え、畳んでも何も隠れない状態を避ける値 (和文では約 16 行)。
const COLLAPSE_LINES = 13;
const COLLAPSE_CHARS = 800;

export function shouldCollapsed(note: Misskey.entities.Note, urls: string[]): boolean {
	if (note.cw != null) {
		return false;
	}

	if (note.text != null) {
		if (
			note.text.includes('$[x2') ||
			note.text.includes('$[x3') ||
			note.text.includes('$[x4') ||
			note.text.includes('$[scale') ||
			note.text.split('\n').length > COLLAPSE_LINES ||
			note.text.length > COLLAPSE_CHARS
		) {
			return true;
		}
	}

	if (urls.length >= 4) {
		return true;
	}

	if (note.files != null && note.files.length >= 5) {
		return true;
	}

	return false;
}
