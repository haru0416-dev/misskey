/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { walk } from 'oxc-walker';
import type { ESTree } from 'rolldown/utils';
import type { ChunkRewrite } from './rewrite-chunks.js';

// ミニファイ後は i18n の識別子が変わり、ロケールインライナーが unref(i18n) と他の副作用を持つ呼び出しを区別できないため、ミニファイ前に unref を除去する。
export function removeUnrefI18n(i18nSymbolName = 'i18n'): ChunkRewrite {
	return {
		marker: `unref(${i18nSymbolName})`,
		apply(ast, magicString) {
			walk(ast, {
				enter(node: ESTree.Node) {
					if (
						node.type === 'CallExpression' &&
						node.callee.type === 'Identifier' &&
						node.callee.name === 'unref' &&
						node.arguments.length === 1
					) {
						const arg = node.arguments[0];
						if (arg?.type === 'Identifier' && arg.name === i18nSymbolName) {
							magicString.remove(node.start, arg.start);
							magicString.remove(arg.end, node.end);
						}
					}
				},
			});
		},
	};
}
