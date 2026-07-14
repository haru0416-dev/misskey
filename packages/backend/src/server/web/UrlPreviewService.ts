/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { SummalyResult } from '@misskey-dev/summaly';
import type { Config } from '@/config.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { deepClone } from '@/misc/clone.js';
import { MemoryKVCache } from '@/misc/cache.js';
import { isKeywordIncluded } from '@/misc/is-keyword-included.js';
import { query } from '@/misc/prelude/url.js';
import { LoggerService } from '@/core/LoggerService.js';
import type { HonoApiErrorBody } from '@/server/rest/error.js';
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
	const summalyDefaultUserAgent = `SummalyBot/${_SUMMALY_VERSION_} (${config.instance.url}; +https://github.com/misskey-dev/summaly/blob/master/README.md)`;
	const summaryCache = new MemoryKVCache<SummalyResult>(1000 * 60 * 60, 100); // 1h, 100 entries

	function wrap(url?: string | null): string | null {
		return url != null
			? `${config.media.proxyUrl}/preview.webp?${query({
				url,
				preview: '1',
			})}`
			: null;
	}

	async function handle(
		request: UrlPreviewRequest,
		reply: UrlPreviewReply,
	): Promise<object | undefined> {
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
				} satisfies HonoApiErrorBody['error'],
			};
		}

		logger.info(meta.urlPreviewSummaryProxyUrl
			? `(Proxy) Getting preview of ${url}@${normalizedLang} ...`
			: `Getting preview of ${url}@${normalizedLang} ...`);

		try {
			const summary = deepClone(await summaryCache.fetchMaybe(JSON.stringify([url, normalizedLang]), async () => {
				const result = meta.urlPreviewSummaryProxyUrl
					? await fetchSummaryFromProxy(url, meta, normalizedLang)
					: await fetchSummary(url, meta, normalizedLang);

				if (!(result.url.startsWith('http://') || result.url.startsWith('https://'))) return undefined;
				if (result.player.url && !(result.player.url.startsWith('http://') || result.player.url.startsWith('https://'))) return undefined;

				return result;
			}));

			if (summary == null) throw new Error('Invalid summary');

			logger.succ(`Got preview of ${url}: ${summary.title}`);

			summary.icon = wrap(summary.icon);
			summary.thumbnail = wrap(summary.thumbnail);
			if (summary.sensitive !== true) {
				summary.sensitive = isKeywordIncluded(summary.url, meta.urlPreviewSensitiveList);
			}

			// The summary is cached server-side, but moderation rules must take effect immediately.
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
				} satisfies HonoApiErrorBody['error'],
			};
		}
	}

	async function fetchSummary(url: string, meta: MiMeta, lang?: string): Promise<SummalyResult> {
		const { summaly } = await import('@misskey-dev/summaly');

		return summaly(url, {
			followRedirects: meta.urlPreviewAllowRedirect,
			lang: lang ?? 'ja-JP',
			agent: {
				http: httpRequestService.httpAgent,
				https: httpRequestService.httpsAgent,
			},
			userAgent: meta.urlPreviewUserAgent ?? summalyDefaultUserAgent,
			operationTimeout: meta.urlPreviewTimeout,
			contentLengthLimit: meta.urlPreviewMaximumContentLength,
			contentLengthRequired: meta.urlPreviewRequireContentLength,
		});
	}

	function fetchSummaryFromProxy(url: string, meta: MiMeta, lang?: string): Promise<SummalyResult> {
		const proxy = meta.urlPreviewSummaryProxyUrl!;
		const queryStr = query({
			url: url,
			lang: lang ?? 'ja-JP',
			followRedirects: meta.urlPreviewAllowRedirect,
			userAgent: meta.urlPreviewUserAgent ?? summalyDefaultUserAgent,
			operationTimeout: meta.urlPreviewTimeout,
			contentLengthLimit: meta.urlPreviewMaximumContentLength,
			contentLengthRequired: meta.urlPreviewRequireContentLength,
		});

		return httpRequestService.getJson<SummalyResult>(`${proxy}?${queryStr}`, 'application/json, */*', undefined, true);
	}

	function dispose(): void {
		summaryCache.dispose();
	}

	return { handle, dispose };
}

export type UrlPreviewService = ReturnType<typeof createUrlPreviewService>;
