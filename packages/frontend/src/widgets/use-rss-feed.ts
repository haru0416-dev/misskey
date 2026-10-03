/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import { url as base } from '@/shared/utility/config.js';
import { PollingScheduler } from '@/utility/polling-scheduler.js';
import { tryParseUrl } from '@/shared/utility/url.js';

type RssWidgetProps = {
	url: string;
	refreshIntervalSec: number;
};

/**
 * 項目のリンクは a 要素の href に渡すため、スクリプトを実行できるスキームを除き、
 * 相対 URL を解決した結果が HTTP(S) のものだけを表示する。
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
	// 取得・解析に失敗したか。空のフィード (成功して項目 0 件) と区別して表示する。直前に取れた項目は残す。
	const error = ref(false);
	const fetchEndpoint = computed(() => {
		const url = new URL('/api/fetch-rss', base);
		url.searchParams.set('url', widgetProps.url);
		return url.toString();
	});
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
				error.value = false;
				fetching.value = false;
				onFetched?.();
			})
			.catch(() => {
				if (pendingRequest !== request) return;
				error.value = true;
				fetching.value = false;
			})
			.finally(() => {
				if (pendingRequest === request) pendingRequest = null;
			});
	};

	// ライフサイクルは setup の中で 1 回だけ登録する。更新間隔の変更時に useInterval を呼び直すと、
	// マウント後には onMounted が発火せず、古いタイマーだけ消えて自動更新が止まる。
	let scheduler: PollingScheduler | null = null;
	let active = false;
	const restartScheduler = () => {
		scheduler?.dispose();
		scheduler = new PollingScheduler(tick, Math.max(10_000, widgetProps.refreshIntervalSec * 1000));
		if (active) scheduler.start(true);
	};

	watch(fetchEndpoint, tick);
	watch(() => widgetProps.refreshIntervalSec, restartScheduler);

	onMounted(() => {
		active = true;
		restartScheduler();
	});
	onActivated(() => {
		if (active) return;
		active = true;
		scheduler?.start(true);
	});
	onDeactivated(() => {
		active = false;
		scheduler?.stop();
	});
	onUnmounted(() => {
		active = false;
		scheduler?.dispose();
		scheduler = null;
		pendingRequest?.abort();
		pendingRequest = null;
	});

	return {
		rawItems,
		fetching,
		error,
	};
}
