/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as mfm from 'mfm-js';
import { createMemoryKVCache } from '@/misc/cache.js';

/**
 * 同じ本文の MFM パース結果を使い回す。
 *
 * タグ・絵文字・メンションの抽出 (NoteCreationService) と AP オブジェクトの生成 (notes-ap) が
 * 同じ本文をパースする。1 回あたり約 0.4ms かかり、別々にパースすると投稿あたり約 0.78ms になる。
 *
 * 返す AST は凍結する。共有したオブジェクトを呼び出し側が書き換えると、別の呼び出し元が
 * 書き換え後の木を受け取る。凍結してあれば、書き換えはその場で例外になる
 * (凍結の費用はパース代に対して測定限界以下)。
 */
const cache = createMemoryKVCache<readonly mfm.MfmNode[]>(1000 * 60 * 5, 1000);

function deepFreeze(node: unknown): void {
	if (Array.isArray(node)) {
		for (const child of node) {
			deepFreeze(child);
		}
		Object.freeze(node);
		return;
	}
	if (node != null && typeof node === 'object') {
		for (const value of Object.values(node)) {
			deepFreeze(value);
		}
		Object.freeze(node);
	}
}

export function parseMfmCached(text: string): readonly mfm.MfmNode[] {
	const cached = cache.get(text);
	if (cached != null) {
		return cached;
	}

	const parsed = mfm.parse(text);
	deepFreeze(parsed);
	cache.set(text, parsed);

	return parsed;
}
