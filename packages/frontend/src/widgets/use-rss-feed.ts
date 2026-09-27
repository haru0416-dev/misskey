/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, onUnmounted, ref, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import { url as base } from '@shared/utility/config.js';
import { useInterval } from '@shared/utility/use-interval.js';
import { tryParseUrl } from '@shared/utility/url.js';

type RssWidgetProps = {
	url: string;
	refreshIntervalSec: number;
};

/**
 * フィードの項目は `<a :href="item.link">` として出るので、`javascript:` などのスキームを
 * そのまま通すと悪意あるフィードを購読しただけでスクリプトを踏まされる。表示前に落とす。
 */
export function filterSafeRssItems(
	items: Misskey.entities.FetchRssResponse['items'],
): Misskey.entities.FetchRssResponse['items'] {
	return items.filter((item) => {
		if (!item.link) {
			return false;
		}
		const itemUrl = tryParseUrl(item.link, base);
		return itemUrl != null && (itemUrl.protocol === 'http:' || itemUrl.protocol === 'https:');
	});
}

export function useRssFeed(widgetProps: RssWidgetProps, onFetched?: () => void) {
	const rawItems = ref<Misskey.entities.FetchRssResponse['items']>([]);
	const fetching = ref(true);
	const fetchEndpoint = computed(() => {
		const url = new URL('/api/fetch-rss', base);
		url.searchParams.set('url', widgetProps.url);
		return url.toString();
	});
	const intervalClear = ref<(() => void) | undefined>();
	let pendingRequest: AbortController | null = null;

	const tick = () => {
		pendingRequest?.abort();
		pendingRequest = null;
		if (window.document.visibilityState === 'hidden' && rawItems.value.length !== 0) {
			return;
		}

		const request = new AbortController();
		pendingRequest = request;
		return window
			.fetch(fetchEndpoint.value, { signal: request.signal })
			.then((res) => {
				if (!res.ok) {
					throw new Error();
				}
				return res.json();
			})
			.then((feed: Misskey.entities.FetchRssResponse) => {
				if (pendingRequest !== request) return;
				rawItems.value = filterSafeRssItems(feed.items);
				fetching.value = false;
				onFetched?.();
			})
			.catch(() => {
				if (pendingRequest === request) fetching.value = false;
			})
			.finally(() => {
				if (pendingRequest === request) pendingRequest = null;
			});
	};

	watch(fetchEndpoint, tick);
	watch(
		() => widgetProps.refreshIntervalSec,
		() => {
			if (intervalClear.value) {
				intervalClear.value();
			}
			intervalClear.value = useInterval(tick, Math.max(10_000, widgetProps.refreshIntervalSec * 1000), {
				immediate: true,
				afterMounted: true,
			});
		},
		{ immediate: true },
	);

	onUnmounted(() => {
		pendingRequest?.abort();
		pendingRequest = null;
	});

	return {
		rawItems,
		fetching,
	};
}
