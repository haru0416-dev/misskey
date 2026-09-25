/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { nextTick, watch } from 'vue';
import type { ShallowRef } from 'vue';
import type { Tab } from '@/components/layout/MkTabs.vue';
import { genId } from '@/utility/id.js';

const cssAnchorSupported = CSS.supports('position-anchor', '--anchor-name');

// MkTabs と MkPageHeader.tabs の選択中タブの下線。CSS anchor positioning が使えない環境では座標を計算して動かす。
export function useTabHighlight(opts: {
	activeKey: () => string | undefined;
	tabs: () => Tab[];
	highlightEl: Readonly<ShallowRef<HTMLElement | null>>;
}) {
	const tabAnchorName = `--${genId()}-currentTab`;
	const tabRefs: Record<string, HTMLElement | null> = {};

	function getTabStyle(t: Tab): Record<string, string> {
		if (!cssAnchorSupported) {
			return {};
		}
		if (t.key === opts.activeKey()) {
			return {
				anchorName: tabAnchorName,
			};
		}
		return {};
	}

	function renderTab() {
		if (cssAnchorSupported) {
			return;
		}

		const activeKey = opts.activeKey();
		const tabEl = activeKey ? tabRefs[activeKey] : undefined;
		const highlightEl = opts.highlightEl.value;
		if (tabEl && highlightEl && highlightEl.parentElement) {
			// offsetWidth や offsetLeft は少数を丸めてしまうため getBoundingClientRect を使う必要がある
			// https://developer.mozilla.org/ja/docs/Web/API/HTMLElement/offsetWidth#%E5%80%A4
			const parentRect = highlightEl.parentElement.getBoundingClientRect();
			const rect = tabEl.getBoundingClientRect();
			highlightEl.style.width = rect.width + 'px';
			highlightEl.style.left = rect.left - parentRect.left + highlightEl.parentElement.scrollLeft + 'px';
		}
	}

	// ラベル展開中の幅はまだ確定していないため、Transition(150ms)後に下線を置き直す。
	let entering = false;

	async function enter(el: Element) {
		if (!(el instanceof HTMLElement)) {
			return;
		}
		entering = true;
		const elementWidth = el.getBoundingClientRect().width;
		el.style.width = '0';
		el.style.paddingLeft = '0';
		el.offsetWidth; // スタイル変更を反映するため reflow を発生させる。
		el.style.width = `${elementWidth}px`;
		el.style.paddingLeft = '';
		nextTick().then(() => {
			entering = false;
		});

		window.setTimeout(renderTab, 170);
	}

	function afterEnter(el: Element) {
		if (!(el instanceof HTMLElement)) {
			return;
		}
	}

	async function leave(el: Element) {
		if (!(el instanceof HTMLElement)) {
			return;
		}
		const elementWidth = el.getBoundingClientRect().width;
		el.style.width = `${elementWidth}px`;
		el.style.paddingLeft = '';
		el.offsetWidth; // スタイル変更を反映するため reflow を発生させる。
		el.style.width = '0';
		el.style.paddingLeft = '0';
	}

	function afterLeave(el: Element) {
		if (!(el instanceof HTMLElement)) {
			return;
		}
		el.style.width = '';
	}

	// タブ要素の参照が揃ってから呼ぶ必要があるため、呼び出し側の onMounted で開始する。
	function watchHighlight() {
		if (cssAnchorSupported) {
			return;
		}
		watch(
			[opts.activeKey, opts.tabs],
			() => {
				nextTick().then(() => {
					if (entering) {
						return;
					}
					renderTab();
				});
			},
			{ immediate: true },
		);
	}

	return {
		cssAnchorSupported,
		tabAnchorName,
		tabRefs,
		getTabStyle,
		renderTab,
		enter,
		afterEnter,
		leave,
		afterLeave,
		watchHighlight,
	};
}
