/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { SummalyResult } from '@misskey-dev/summaly';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { Config } from '@/config.js';
import type { HttpRequestService } from '@/core/net/HttpRequestService.js';
import type { LoggerService } from '@/core/LoggerService.js';
import type { MiMeta } from '@/models/Meta.js';
import { createUrlPreviewService } from '@/server/web/UrlPreviewService.js';

beforeAll(() => {
	vi.stubGlobal('_SUMMALY_VERSION_', 'test');
});

afterAll(() => {
	vi.unstubAllGlobals();
});

const config = {
	instance: { url: 'https://misskey.test' },
	media: { proxyUrl: 'https://media.test' },
} as Config;

function createMeta(): MiMeta {
	return {
		urlPreviewEnabled: true,
		urlPreviewSummaryProxyUrl: 'https://preview.test',
		urlPreviewAllowRedirect: false,
		urlPreviewUserAgent: null,
		urlPreviewTimeout: 1000,
		urlPreviewMaximumContentLength: 1024,
		urlPreviewRequireContentLength: false,
		urlPreviewSensitiveList: [],
	} as unknown as MiMeta;
}

function createSummary(): SummalyResult {
	return {
		url: 'https://example.com/article',
		title: 'Example',
		icon: 'https://example.com/icon.png',
		thumbnail: 'https://example.com/thumbnail.png',
		player: { url: null },
	} as SummalyResult;
}

function createReply() {
	return {
		code: vi.fn(),
		header: vi.fn(),
	};
}

function createService(getJson: HttpRequestService['getJson'], meta = createMeta()) {
	return createUrlPreviewService(
		config,
		meta,
		{ getJson } as HttpRequestService,
		{
			getLogger: () => ({
				info: vi.fn(),
				succ: vi.fn(),
				warn: vi.fn(),
			}),
		} as unknown as LoggerService,
	);
}

describe('createUrlPreviewService', () => {
	test('reuses a cached summary without mutating the cached original', async () => {
		const source = createSummary();
		const getJson = vi.fn().mockResolvedValue(source);
		const service = createService(getJson);

		try {
			const firstReply = createReply();
			const first = await service.handle({ query: { url: 'https://example.com/article', lang: 'en-US' } }, firstReply);
			const second = await service.handle(
				{ query: { url: 'https://example.com/article', lang: 'en-US' } },
				createReply(),
			);

			expect(getJson).toHaveBeenCalledOnce();
			expect(first).toEqual(second);
			expect(firstReply.header).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
			expect((first as SummalyResult).icon).toContain('https://media.test/preview.webp?');
			expect(source.icon).toBe('https://example.com/icon.png');
			expect(source.thumbnail).toBe('https://example.com/thumbnail.png');
		} finally {
			service.dispose();
		}
	});

	test('does not cache invalid summaries', async () => {
		const invalid = { ...createSummary(), url: 'file:///etc/passwd' };
		const getJson = vi.fn().mockResolvedValue(invalid);
		const service = createService(getJson);

		try {
			const firstReply = createReply();
			const secondReply = createReply();
			await service.handle({ query: { url: 'https://example.com/article' } }, firstReply);
			await service.handle({ query: { url: 'https://example.com/article' } }, secondReply);

			expect(getJson).toHaveBeenCalledTimes(2);
			expect(firstReply.code).toHaveBeenCalledWith(422);
			expect(secondReply.code).toHaveBeenCalledWith(422);
		} finally {
			service.dispose();
		}
	});

	test('marks matching URL previews as sensitive', async () => {
		const getJson = vi.fn().mockResolvedValue(createSummary());
		const service = createService(getJson, {
			...createMeta(),
			urlPreviewSensitiveList: ['example.com article'],
		} as MiMeta);

		try {
			const result = await service.handle({ query: { url: 'https://example.com/article' } }, createReply());
			expect((result as SummalyResult).sensitive).toBe(true);
		} finally {
			service.dispose();
		}
	});

	test('preserves Summaly sensitive result and ignores invalid or unsafe regular expressions', async () => {
		const summary = { ...createSummary(), sensitive: true } as SummalyResult;
		const getJson = vi.fn().mockResolvedValue(summary);
		const service = createService(getJson, {
			...createMeta(),
			urlPreviewSensitiveList: ['/([a-z]+)+$/', '/[/'],
		} as MiMeta);

		try {
			const result = await service.handle({ query: { url: 'https://example.com/article' } }, createReply());
			expect((result as SummalyResult).sensitive).toBe(true);
		} finally {
			service.dispose();
		}
	});
});
