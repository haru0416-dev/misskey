/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent, h, nextTick, reactive } from 'vue';
import { resetFetchMocks } from './fixtures.js';
import { useRssFeed } from '@/widgets/use-rss-feed.js';

type Feed = ReturnType<typeof useRssFeed>;

function renderFeed(url: string, onFetched?: () => void) {
	const widgetProps = reactive({ url, refreshIntervalSec: 60 });
	let feed!: Feed;
	const Component = defineComponent({
		setup() {
			feed = useRssFeed(widgetProps, onFetched);
			return () => h('div');
		},
	});
	const result = render(Component);
	return { widgetProps, result, feed: () => feed };
}

/** ネイティブの Response.json() は固定回数のマイクロタスクだけでは完了しない。 */
async function flush(feed: () => Feed) {
	await vi.waitFor(() => expect(feed().fetching.value).toBe(false));
}

/** init.ts が張るロケール取得などのモックと混ざるので、対象のエンドポイントだけ拾う。 */
function fetchRssRequests(): URL[] {
	return fetchMock.mock.calls
		.map((call) => new URL(String(call[0]), window.location.origin))
		.filter((requested) => requested.pathname === '/api/fetch-rss');
}

describe('useRssFeed', () => {
	afterEach(() => {
		cleanup();
		resetFetchMocks();
		vi.restoreAllMocks();
	});

	test('fetches through /api/fetch-rss on mount and notifies the caller', async () => {
		const items = [{ title: 'entry', link: 'https://example.com/entry' }];
		fetchMock.mockOnceIf(
			(req) => new URL(req.url).pathname === '/api/fetch-rss',
			() => ({ status: 200, body: JSON.stringify({ items }) }),
		);
		const onFetched = vi.fn();

		const { feed } = renderFeed('https://example.com/rss', onFetched);
		expect(feed().fetching.value).toBe(true);

		await flush(feed);

		const requested = fetchRssRequests();
		expect(requested).toHaveLength(1);
		expect(requested[0]!.searchParams.get('url')).toBe('https://example.com/rss');
		expect(feed().rawItems.value).toEqual(items);
		expect(feed().fetching.value).toBe(false);
		expect(onFetched).toHaveBeenCalledOnce();
	});

	test('drops items whose link is not http(s)', async () => {
		const items = [
			{ title: 'safe', link: 'https://example.com/entry' },
			{ title: 'relative', link: '/relative' },
			{ title: 'script', link: 'javascript:alert(1)' },
			{ title: 'broken', link: 'https://[invalid' },
			{ title: 'no link' },
		];
		fetchMock.mockOnceIf(
			(req) => new URL(req.url).pathname === '/api/fetch-rss',
			() => ({ status: 200, body: JSON.stringify({ items }) }),
		);

		const { feed } = renderFeed('https://example.com/rss');
		await flush(feed);

		expect(feed().rawItems.value.map((item) => item.title)).toEqual(['safe', 'relative']);
	});

	test('stops fetching but keeps the previous items when the response fails', async () => {
		fetchMock.mockOnceIf(
			(req) => new URL(req.url).pathname === '/api/fetch-rss',
			() => ({ status: 500, body: '' }),
		);
		const onFetched = vi.fn();

		const { feed } = renderFeed('https://example.com/broken', onFetched);
		await flush(feed);

		expect(feed().rawItems.value).toEqual([]);
		expect(feed().fetching.value).toBe(false);
		expect(feed().error.value).toBe(true);
		expect(onFetched).not.toHaveBeenCalled();
	});

	test('distinguishes an empty feed from a failed fetch', async () => {
		fetchMock.mockOnceIf(
			(req) => new URL(req.url).pathname === '/api/fetch-rss',
			() => ({ status: 200, body: JSON.stringify({ items: [] }) }),
		);

		const { feed } = renderFeed('https://example.com/empty');
		await flush(feed);

		expect(feed().rawItems.value).toEqual([]);
		expect(feed().fetching.value).toBe(false);
		expect(feed().error.value).toBe(false);
	});

	// 更新間隔の変更で古いタイマーだけ消え、新しいタイマーが始まらないと自動更新が止まる。
	test('keeps polling after the refresh interval changes', async () => {
		vi.useFakeTimers();
		try {
			// 常設の応答はロケールの応答を置き換えるので、1 回分ずつ積む。余りは afterEach で捨てる。
			for (let i = 0; i < 5; i++) {
				fetchMock.mockOnceIf(
					(req) => new URL(req.url).pathname === '/api/fetch-rss',
					() => ({ status: 200, body: JSON.stringify({ items: [] }) }),
				);
			}
			const { widgetProps, feed } = renderFeed('https://example.com/interval');
			await flush(feed);
			expect(fetchRssRequests()).toHaveLength(1);

			widgetProps.refreshIntervalSec = 30;
			await nextTick();
			await vi.advanceTimersByTimeAsync(30_000);
			await flush(feed);
			await vi.advanceTimersByTimeAsync(30_000);
			await flush(feed);

			// 変更直後に 1 回、その後 30 秒ごとに取得する。
			expect(fetchRssRequests().length).toBeGreaterThanOrEqual(3);
		} finally {
			vi.useRealTimers();
		}
	});
});
