/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const searchEngines = ['google', 'duckduckgo', 'bing', 'brave'] as const;

export type SearchEngine = (typeof searchEngines)[number];

const searchEngineDefinitions: Record<SearchEngine, { origin: string; path: string; queryParameter: string }> = {
	google: { origin: 'https://www.google.com', path: '/search', queryParameter: 'q' },
	duckduckgo: { origin: 'https://duckduckgo.com', path: '/', queryParameter: 'q' },
	bing: { origin: 'https://www.bing.com', path: '/search', queryParameter: 'q' },
	brave: { origin: 'https://search.brave.com', path: '/search', queryParameter: 'q' },
};

export function createSearchUrl(engine: SearchEngine, query: string): URL {
	const definition = searchEngineDefinitions[engine];
	const url = new URL(definition.path, definition.origin);
	url.searchParams.set(definition.queryParameter, query);
	return url;
}
