/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { RolldownMagicString } from 'rolldown';
import type { ESTree } from 'rolldown/utils';
import type { Plugin } from 'vite';

/** 出力チャンクに対する書き換え。marker を含むチャンクにだけ当てる。 */
export type ChunkRewrite = {
	marker: string;
	apply(ast: ESTree.Program, magicString: RolldownMagicString): void;
};

/**
 * ミニファイ前の出力チャンクを書き換える。チャンクの構文解析は出力の段階で直列に走るため、
 * 書き換えごとにプラグインを分けず、1 回の解析を全部の書き換えで使う。
 * 書き換えどうしが同じ範囲を編集すると MagicString が例外を出す。
 */
export function pluginRewriteChunks(rewrites: ChunkRewrite[]): Plugin {
	return {
		name: 'rewrite-chunks',
		renderChunk(code, _chunk, _options, meta) {
			const active = rewrites.filter((rewrite) => code.includes(rewrite.marker));
			if (active.length === 0) {
				return null;
			}
			const ast = this.parse(code) as ESTree.Program;
			const magicString = meta.magicString ?? new RolldownMagicString(code);
			for (const rewrite of active) {
				rewrite.apply(ast, magicString);
			}
			return magicString;
		},
	};
}
