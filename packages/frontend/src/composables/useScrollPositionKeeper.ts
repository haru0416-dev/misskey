/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { throttle } from 'throttle-debounce';
import { nextTick, onActivated, onDeactivated, onUnmounted, watch } from 'vue';
import type { Ref } from 'vue';

// note render skipping による高さの変化を避けるため、表示中の anchor を基準に復元する。
// 復元後も先頭に留まった場合は、保存したscrollTopへフォールバックする。

export function useScrollPositionKeeper(scrollContainerRef: Ref<HTMLElement | null | undefined>): void {
	let anchorId: string | null = null;
	// キャプチャ時のアンカー要素上端のコンテナ上端からの距離
	let anchorContainerLocalY = 0;
	let savedScrollTop = 0;
	let ready = true;
	let restoreTimer: number | null = null;

	watch(
		scrollContainerRef,
		(el, _oldEl, onCleanup) => {
			if (!el) return;

			const captureAnchor = () => {
				if (!el) return;
				if (!ready) return;

				if (el.scrollTop < 100) {
					// 上部にいるときはanchorを参照するとズレの原因になるし位置復元するメリットも乏しいため設定しない
					anchorId = null;
					return;
				}

				const scrollContainerRect = el.getBoundingClientRect();
				const viewPosition = scrollContainerRect.top + scrollContainerRect.height / 2;

				const anchorEls = el.querySelectorAll<HTMLElement>('[data-scroll-anchor]');
				for (let i = anchorEls.length - 1; i > -1; i--) {
					const anchorEl = anchorEls[i];
					if (anchorEl == null) continue;
					const anchorTop = anchorEl.getBoundingClientRect().top;
					// 上端が viewPosition 以下の最初の要素（＝中央を跨ぐか、中央より上にある中で最も近いもの）を選択する
					// 最下部スクロール時に min-height による空白に viewPosition が入った場合も最後のアイテムをキャプチャできる
					if (anchorTop <= viewPosition) {
						anchorId = anchorEl.getAttribute('data-scroll-anchor');
						anchorContainerLocalY = anchorTop - scrollContainerRect.top;
						break;
					}
				}
			};

			// https://github.com/vuejs/vue/issues/9454
			// https://github.com/vuejs/rfcs/pull/284
			const throttledCaptureAnchor = throttle(1000, captureAnchor);
			el.addEventListener('scroll', throttledCaptureAnchor, { passive: true });
			// スクロール後のクリックでは throttle 前の anchorId が残るため、pointerdown で更新する。
			el.addEventListener('pointerdown', captureAnchor, { passive: true });

			onCleanup(() => {
				throttledCaptureAnchor.cancel();
				el.removeEventListener('scroll', throttledCaptureAnchor);
				el.removeEventListener('pointerdown', captureAnchor);
			});
		},
		{
			immediate: true,
		},
	);

	const restore = () => {
		if (!anchorId) return;
		const scrollContainer = scrollContainerRef.value;
		if (!scrollContainer) return;
		const scrollAnchorEl = scrollContainer.querySelector<HTMLElement>(`[data-scroll-anchor="${CSS.escape(anchorId)}"]`);
		if (!scrollAnchorEl) return;
		const anchorRect = scrollAnchorEl.getBoundingClientRect();
		// anchorContentY: コンテンツ先頭からのアンカー要素上端の距離（scrollTopに依存しない）
		const anchorContentY = scrollContainer.scrollTop + anchorRect.top - scrollContainer.getBoundingClientRect().top;
		// キャプチャ時と同じ scrollTop になるよう直接セット（コンテナ高さ変化に依存しない）
		scrollContainer.scrollTop = anchorContentY - anchorContainerLocalY;
	};

	onDeactivated(() => {
		if (restoreTimer != null) {
			window.clearTimeout(restoreTimer);
			restoreTimer = null;
		}
		const el = scrollContainerRef.value;
		if (el) savedScrollTop = el.scrollTop;
		ready = false;
	});

	onActivated(() => {
		restore();
		nextTick(() => {
			restore();
			restoreTimer = window.setTimeout(() => {
				restoreTimer = null;
				restore();

				// anchor方式が失敗した場合（anchorIdがnullまたは要素が見つからない場合）の
				// フォールバック
				const el = scrollContainerRef.value;
				if (el?.scrollTop === 0 && savedScrollTop > 0) {
					el.scrollTop = savedScrollTop;
				}

				ready = true;
			}, 100);
		});
	});

	onUnmounted(() => {
		if (restoreTimer != null) window.clearTimeout(restoreTimer);
	});
}
