/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as mfm from 'mfm-js';
import { MemoryKVCache } from '@/misc/cache.js';

/**
 * 同じ本文の MFM パース結果を使い回す。
 *
 * 1投稿につき、タグ・絵文字・メンションの抽出 (notes-create) と AP オブジェクトの生成
 * (notes-ap) が同じ文字列を独立にパースしていた。実測で1回 0.4ms、合わせて投稿あたり
 * 0.78ms を占める。入力が同じなら結果も同じなので、後者は前者の結果を使い回せる。
 *
 * 返す AST は凍結する。共有したオブジェクトを呼び出し側が書き換えると、別の呼び出し元が
 * 壊れた木を受け取る。凍結してあれば書き換えは例外として即座に露見する
 * (凍結の費用はパース代に対して測定限界以下)。
 */
const cache = new MemoryKVCache<readonly mfm.MfmNode[]>(1000 * 60 * 5, 1000);

function deepFreeze(node: unknown): void {
	if (Array.isArray(node)) {
		for (const child of node) deepFreeze(child);
		Object.freeze(node);
		return;
	}
	if (node != null && typeof node === 'object') {
		for (const value of Object.values(node)) deepFreeze(value);
		Object.freeze(node);
	}
}

export function parseMfmCached(text: string): readonly mfm.MfmNode[] {
	const cached = cache.get(text);
	if (cached != null) return cached;

	const parsed = mfm.parse(text);
	deepFreeze(parsed);
	cache.set(text, parsed);

	return parsed;
}
