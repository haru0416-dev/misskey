/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, ref, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import { url as base } from '@shared/utility/config.js';
import { useInterval } from '@shared/utility/use-interval.js';

type RssWidgetProps = {
	url: string;
	refreshIntervalSec: number;
};

export function useRssFeed(widgetProps: RssWidgetProps, onFetched?: () => void) {
	const rawItems = ref<Misskey.entities.FetchRssResponse['items']>([]);
	const fetching = ref(true);
	const fetchEndpoint = computed(() => {
		const url = new URL('/api/fetch-rss', base);
		url.searchParams.set('url', widgetProps.url);
		return url.toString();
	});
	const intervalClear = ref<(() => void) | undefined>();

	const tick = () => {
		if (window.document.visibilityState === 'hidden' && rawItems.value.length !== 0) return;

		window
			.fetch(fetchEndpoint.value, {})
			.then((res) => {
				if (!res.ok) throw new Error();
				return res.json();
			})
			.then((feed: Misskey.entities.FetchRssResponse) => {
				rawItems.value = feed.items;
				fetching.value = false;
				onFetched?.();
			})
			.catch(() => {
				fetching.value = false;
			});
	};

	watch(fetchEndpoint, tick);
	watch(
		() => widgetProps.refreshIntervalSec,
		() => {
			if (intervalClear.value) {
				intervalClear.value();
			}
			intervalClear.value = useInterval(tick, Math.max(10000, widgetProps.refreshIntervalSec * 1000), {
				immediate: true,
				afterMounted: true,
			});
		},
		{ immediate: true },
	);

	return {
		rawItems,
		fetching,
	};
}
