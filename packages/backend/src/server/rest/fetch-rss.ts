/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Parser from 'rss-parser';
import { z } from 'zod';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import { HonoApiError } from './error.js';
import { parseHonoApiParams } from './validation.js';

const FETCH_RSS_MAX_SIZE = 1024 * 1024;
const FETCH_RSS_MAX_URL_LENGTH = 8192;

/**
 * 同時に走らせてよい外向きRSS取得の本数。
 *
 * このエンドポイントは未認証で叩けるうえ 1 リクエストが最大5秒の外向き接続を掴むので、
 * IPあたりのレートリミットだけでは分散したリクエストで全ワーカーを塞げてしまう。
 */
const FETCH_RSS_MAX_CONCURRENCY = 32;

/** xml2js を非同期モードで回す。既定の同期パースは 1MiB のXMLでイベントループを止めるため。 */
const rssParser = new Parser({
	xml2js: {
		async: true,
	},
});

/** 同一URLへの同時リクエストは1本にまとめて、その結果を全員で共有する。 */
const inFlightRequests = new Map<string, Promise<unknown>>();

export type HonoApiFetchRssDependencies = {
	httpRequestService: HttpRequestService;
};

export const fetchRssParamDef = z.object({
	url: z.string(),
});

function invalidUrlError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Invalid URL.',
		code: 'INVALID_URL',
		id: '89b7ee05-ccfc-4bdd-9b13-61172fd1e06c',
	});
}

function fetchRssFailedError(): HonoApiError {
	return new HonoApiError({
		status: 422,
		message: 'Failed to fetch RSS.',
		code: 'FETCH_RSS_FAILED',
		id: '8db5d3d8-31d7-452f-b0cc-ca3b8925de12',
		kind: 'server',
	});
}

function fetchRssUnavailableError(): HonoApiError {
	return new HonoApiError({
		status: 503,
		message: 'RSS fetching is temporarily unavailable.',
		code: 'FETCH_RSS_UNAVAILABLE',
		id: '91e6ff44-c63f-4725-9ad0-b7a40d7f7655',
		kind: 'server',
	});
}

/**
 * 取得前にURLを正規化する。
 *
 * `HttpRequestService` がホップごとに private アドレスを弾くので SSRF 自体はそちらで止まるが、
 * ここでは (1) スキームを http(s) に限る (2) URLに埋め込まれた認証情報を拒否する
 * (3) フラグメント違いを同一URLとして畳んで in-flight 共有を効かせる、の3点を担う。
 */
function normalizeFetchRssUrl(input: string): string {
	if (input.length === 0 || input.length > FETCH_RSS_MAX_URL_LENGTH) {
		throw invalidUrlError();
	}

	let url: URL;
	try {
		url = new URL(input);
	} catch {
		throw invalidUrlError();
	}

	if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username !== '' || url.password !== '') {
		throw invalidUrlError();
	}

	url.hash = '';
	return url.href;
}

async function fetchRss(deps: HonoApiFetchRssDependencies, url: string): Promise<unknown> {
	const res = await deps.httpRequestService.send(url, {
		method: 'GET',
		headers: {
			Accept: 'application/rss+xml, */*',
		},
		timeout: 5000,
		size: FETCH_RSS_MAX_SIZE,
	});

	const finalUrl = new URL(res.url);
	if (finalUrl.protocol !== 'http:' && finalUrl.protocol !== 'https:') {
		throw new Error('Invalid final URL protocol');
	}

	return await rssParser.parseString(await res.text());
}

export async function handleHonoApiFetchRss(
	deps: HonoApiFetchRssDependencies,
	body: Record<string, unknown>,
): Promise<unknown> {
	const params = parseHonoApiParams(fetchRssParamDef, body);
	const url = normalizeFetchRssUrl(params.url);

	const inFlight = inFlightRequests.get(url);
	if (inFlight != null) return await inFlight;

	if (inFlightRequests.size >= FETCH_RSS_MAX_CONCURRENCY) {
		throw fetchRssUnavailableError();
	}

	const request = fetchRss(deps, url)
		.catch(() => {
			// 取得先の詳細 (接続拒否か、private アドレス遮断か等) を呼び出し元へ漏らさない
			throw fetchRssFailedError();
		})
		.finally(() => {
			inFlightRequests.delete(url);
		});
	inFlightRequests.set(url, request);

	return await request;
}
