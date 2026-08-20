/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { GeneratedSearchIndexItem } from 'search-index';

export type SearchIndexItem = GeneratedSearchIndexItem;

export function genSearchIndexes(generated: GeneratedSearchIndexItem[]): SearchIndexItem[] {
	const rootMods = new Map(generated.map((item) => [item.id, item]));

	for (const item of generated) {
		if (item.inlining) {
			for (const id of item.inlining) {
				const inline = rootMods.get(id);
				if (inline) {
					inline.parentId = item.id;
					if (item.path === undefined) {
						delete inline.path;
					} else {
						inline.path = item.path;
					}
				} else {
					console.log('[Settings Search Index] Failed to inline', id);
				}
			}
		}
	}

	return generated;
}
