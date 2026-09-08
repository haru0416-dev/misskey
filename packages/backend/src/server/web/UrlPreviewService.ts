/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fetchUrlPreview } from './UrlPreviewFetcher.js';
import type { UrlPreviewSummary } from 'misskey-js/entities.js';
import type { Config } from '@/config.js';
import { createHttpRequestService, HttpRequestService } from '@/core/net/HttpRequestService.js';
import { deepClone } from '@/misc/clone.js';
import { MemoryKVCache } from '@/misc/cache.js';
import { isKeywordIncluded } from '@/misc/is-keyword-included.js';
import { query } from '@/misc/prelude/url.js';
import { LoggerService } from '@/core/LoggerService.js';
import type { ApiErrorBody } from '@/server/rest/error.js';
import { MiMeta } from '@/models/Meta.js';

export type UrlPreviewRequest = {
	query: {
		url?: unknown;
		lang?: unknown;
	};
};

export type UrlPreviewReply = {
	code: (statusCode: number) => unknown;
	header: (name: string, value: string | number | undefined) => unknown;
};

export function createUrlPreviewService(
	config: Config,
	meta: MiMeta,
	httpRequestService: HttpRequestService,
	loggerService: LoggerService,
) {
	const logger = loggerService.getLogger('url-preview');
	let previewHttp: HttpRequestService | undefined;
	const defaultUserAgent = config.runtime.userAgent;
	const summaryCache = new MemoryKVCache<UrlPreviewSummary>(1000 * 60 * 60, 100); // 1時間、最大100件

	function wrap(url?: string | null): string | null {
		return url != null
			? `${config.media.proxyUrl}/preview.webp?${query({
					url,
					preview: '1',
				})}`
			: null;
	}

	async function handle(request: UrlPreviewRequest, reply: UrlPreviewReply): Promise<object | undefined> {
		const url = request.query.url;
		if (typeof url !== 'string') {
			reply.code(400);
			return;
		}

		const lang = request.query.lang;
		if (Array.isArray(lang)) {
			reply.code(400);
			return;
		}
		if (lang != null && typeof lang !== 'string') {
			reply.code(400);
			return;
		}
		const normalizedLang = lang ?? undefined;

		if (!meta.urlPreviewEnabled) {
			reply.code(403);
			return {
				error: {
					message: 'URL preview is disabled',
					code: 'URL_PREVIEW_DISABLED',
					id: '58b36e13-d2f5-0323-b0c6-76aa9dabefb8',
					kind: 'client',
				} satisfies ApiErrorBody['error'],
			};
		}

		logger.info(
			meta.urlPreviewSummaryProxyUrl
				? `(Proxy) Getting preview of ${url}@${normalizedLang} ...`
				: `Getting preview of ${url}@${normalizedLang} ...`,
		);

		try {
			const summary = deepClone(
				await summaryCache.fetchMaybe(JSON.stringify([url, normalizedLang]), async () => {
					const result = meta.urlPreviewSummaryProxyUrl
						? await fetchSummaryFromProxy(url, meta, normalizedLang)
						: await fetchSummary(url, meta, normalizedLang);

					if (!(result.url.startsWith('http://') || result.url.startsWith('https://'))) {
						return undefined;
					}
					if (
						result.player.url &&
						!(result.player.url.startsWith('http://') || result.player.url.startsWith('https://'))
					) {
						return undefined;
					}

					return result;
				}),
			);

			if (summary == null) {
				throw new Error('Invalid summary');
			}

			logger.succ(`Got preview of ${url}: ${summary.title}`);

			summary.icon = wrap(summary.icon);
			summary.thumbnail = wrap(summary.thumbnail);
			if (summary.sensitive !== true) {
				summary.sensitive = isKeywordIncluded(summary.url, meta.urlPreviewSensitiveList);
			}

			// 要約はサーバー側でキャッシュするが、モデレーションルールは直ちに反映する。
			reply.header('Cache-Control', 'private, no-store');

			return summary;
		} catch (err) {
			logger.warn(`Failed to get preview of ${url}: ${err}`);

			reply.code(422);
			reply.header('Cache-Control', 'max-age=86400, immutable');
			return {
				error: {
					message: 'Failed to get preview',
					code: 'URL_PREVIEW_FAILED',
					id: '09d01cb5-53b9-4856-82e5-38a50c290a3b',
					kind: 'client',
				} satisfies ApiErrorBody['error'],
			};
		}
	}

	async function fetchSummary(url: string, meta: MiMeta, lang?: string): Promise<UrlPreviewSummary> {
		// 送信元IPと接続プール設定を適用するため、BunのHTTP Agent経路を使う。
		previewHttp ??= createHttpRequestService(config, true);
		return fetchUrlPreview(previewHttp, url, {
			followRedirects: meta.urlPreviewAllowRedirect,
			lang: lang ?? 'ja-JP',
			userAgent: meta.urlPreviewUserAgent ?? defaultUserAgent,
			operationTimeout: meta.urlPreviewTimeout,
			contentLengthLimit: meta.urlPreviewMaximumContentLength,
			contentLengthRequired: meta.urlPreviewRequireContentLength,
		});
	}

	function fetchSummaryFromProxy(url: string, meta: MiMeta, lang?: string): Promise<UrlPreviewSummary> {
		const proxy = meta.urlPreviewSummaryProxyUrl!;
		const queryStr = query({
			url: url,
			lang: lang ?? 'ja-JP',
			followRedirects: meta.urlPreviewAllowRedirect,
			userAgent: meta.urlPreviewUserAgent ?? defaultUserAgent,
			operationTimeout: meta.urlPreviewTimeout,
			contentLengthLimit: meta.urlPreviewMaximumContentLength,
			contentLengthRequired: meta.urlPreviewRequireContentLength,
		});

		return httpRequestService.getJson<UrlPreviewSummary>(
			`${proxy}?${queryStr}`,
			'application/json, */*',
			undefined,
			true,
		);
	}

	function dispose(): void {
		summaryCache.dispose();
		previewHttp?.dispose();
	}

	return { handle, dispose };
}

export type UrlPreviewService = ReturnType<typeof createUrlPreviewService>;
