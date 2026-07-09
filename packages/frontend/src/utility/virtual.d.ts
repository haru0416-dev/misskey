/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// NOTE: lib/vite-plugin-create-search-index.ts の SearchIndexItem と同じ形。
// lib/ は tsconfig.json の include 対象外 (Node/Vite設定側) のため、この型は独立して保持している。
type XGeneratedSearchIndexItem = {
	id: string;
	parentId?: string;
	path?: string;
	label: string;
	keywords: string[];
	texts: string[];
	icon?: string;
	inlining?: string[];
};

declare module 'search-index' {
	export type GeneratedSearchIndexItem = XGeneratedSearchIndexItem;
}

declare module 'search-index:settings' {
	export const searchIndexes: XGeneratedSearchIndexItem[];
}

declare module 'search-index:admin' {
	export const searchIndexes: XGeneratedSearchIndexItem[];
}
