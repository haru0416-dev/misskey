/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent, h, reactive } from 'vue';
import './init';
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

/** fetch が解決してから ref に反映されるまでのマイクロタスクを待つ。 */
async function flush() {
	for (let i = 0; i < 5; i++) await Promise.resolve();
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
		// init.ts が張るロケール取得のモックまで消えると実ネットワークへ抜けるので、呼び出し履歴だけ消す。
		fetchMock.mockClear();
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

		await flush();

		const requested = fetchRssRequests();
		expect(requested).toHaveLength(1);
		expect(requested[0]!.searchParams.get('url')).toBe('https://example.com/rss');
		expect(feed().rawItems.value).toEqual(items);
		expect(feed().fetching.value).toBe(false);
		expect(onFetched).toHaveBeenCalledOnce();
	});

	test('stops fetching but keeps the previous items when the response fails', async () => {
		fetchMock.mockOnceIf(
			(req) => new URL(req.url).pathname === '/api/fetch-rss',
			() => ({ status: 500, body: '' }),
		);
		const onFetched = vi.fn();

		const { feed } = renderFeed('https://example.com/broken', onFetched);
		await flush();

		expect(feed().rawItems.value).toEqual([]);
		expect(feed().fetching.value).toBe(false);
		expect(onFetched).not.toHaveBeenCalled();
	});
});
