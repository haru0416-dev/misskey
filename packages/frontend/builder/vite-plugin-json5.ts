/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import JSON5 from 'json5';
import { createFilter } from 'vite';
import type { FilterPattern, Plugin } from 'vite';

// JSON5.parse が投げる SyntaxError の行・列番号を Vite の警告に渡す。
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

		transform: {
			// filter に合わないモジュールでは handler を呼ばない (全モジュールで JS を呼び出す負担を避ける)。
			filter: { id: /\.json5$/ },
			handler(json, id) {
				if (!filter(id)) {
					return null;
				}

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
		},
	};
}
