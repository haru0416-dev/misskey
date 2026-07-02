/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Parser from 'rss-parser';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import { parseHonoApiParams } from './hono-api-validation.js';

const rssParser = new Parser();

export type HonoApiFetchRssDependencies = {
	httpRequestService: HttpRequestService;
};

const fetchRssParamDef = {
	type: 'object',
	properties: {
		url: { type: 'string' },
	},
	required: ['url'],
} as const;

type FetchRssParams = {
	url: string;
};

export async function handleHonoApiFetchRss(
	deps: HonoApiFetchRssDependencies,
	body: Record<string, unknown>,
): Promise<unknown> {
	const params = parseHonoApiParams(fetchRssParamDef, body) as FetchRssParams;
	const res = await deps.httpRequestService.send(params.url, {
		method: 'GET',
		headers: {
			Accept: 'application/rss+xml, */*',
		},
		timeout: 5000,
	});
	const text = await res.text();

	return await rssParser.parseString(text);
}
