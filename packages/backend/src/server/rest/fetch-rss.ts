/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Parser from 'rss-parser';
import { z } from 'zod';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import { parseHonoApiParams } from './validation.js';

const rssParser = new Parser();

const FETCH_RSS_MAX_SIZE = 1024 * 1024;

export type HonoApiFetchRssDependencies = {
	httpRequestService: HttpRequestService;
};

export const fetchRssParamDef = z.object({
	url: z.string(),
});

type FetchRssParams = {
	url: string;
};

export async function handleHonoApiFetchRss(
	deps: HonoApiFetchRssDependencies,
	body: Record<string, unknown>,
): Promise<unknown> {
	const params = parseHonoApiParams(fetchRssParamDef, body);
	const res = await deps.httpRequestService.send(params.url, {
		method: 'GET',
		headers: {
			Accept: 'application/rss+xml, */*',
		},
		timeout: 5000,
		size: FETCH_RSS_MAX_SIZE,
	});
	const text = await res.text();

	return await rssParser.parseString(text);
}
