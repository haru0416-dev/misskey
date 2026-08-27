/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import JSON5 from 'json5';
import { createFilter } from 'vite';
import type { FilterPattern, Plugin } from 'vite';

// json5 は SyntaxError を継承せず、追加プロパティを持つエラーを返す。
// https://github.com/json5/json5/blob/de344f0619bda1465a6e25c76f1c0c3dda8108d9/lib/parse.js#L1111-L1112
interface Json5SyntaxError extends SyntaxError {
	lineNumber: number;
	columnNumber: number;
}

export interface Json5PluginOptions {
	include?: FilterPattern;
	exclude?: FilterPattern;
}

export default function json5(options: Json5PluginOptions = {}): Plugin {
	const filter = createFilter(options.include, options.exclude);

	return {
		name: 'json5',

		transform(json, id) {
			if (id.slice(-6) !== '.json5' || !filter(id)) return null;

			try {
				const parsed = JSON5.parse(json);
				// オブジェクトリテラルではなく JSON.parse で復元する。読み込み側は default しか
				// 使っておらず、大きなリテラルより構文解析が軽い。
				return {
					code: `export default /* @__PURE__ */ JSON.parse(${JSON.stringify(JSON.stringify(parsed))});\n`,
					map: { mappings: '' },
				};
			} catch (err) {
				if (!(err instanceof SyntaxError)) {
					throw err;
				}
				const message = 'Could not parse JSON5 file';
				const { lineNumber, columnNumber } = err as Json5SyntaxError;
				this.warn({ message, id, loc: { line: lineNumber, column: columnNumber } });
				return null;
			}
		},
	};
}
