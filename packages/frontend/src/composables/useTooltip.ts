/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref, watch, onUnmounted } from 'vue';
import type { Ref } from 'vue';

const MOUSEOVER_IGNORE_DURATION = 1000;

export function useTooltip(
	elRef: Ref<HTMLElement | { $el: HTMLElement } | null | undefined>,
	onShow: (showing: Ref<boolean>) => void,
	delay = 300,
): void {
	let isHovering = false;

	// タッチ直後にブラウザが互換mouseoverを発火する場合があるため、短時間だけ無視する。
	// 永続的に無視するとハイブリッド端末でマウスへ戻した後もツールチップが使えなくなる。
	let ignoreMouseoverUntil = 0;

	let timeoutId: number;

	let changeShowingState: (() => void) | null;

	const open = () => {
		close();
		if (!isHovering) return;
		if (elRef.value == null) return;
		const el = elRef.value instanceof Element ? elRef.value : elRef.value.$el;
		if (!window.document.body.contains(el)) return; // openしようとしたときに既に元要素がDOMから消えている場合があるため

		const showing = ref(true);
		onShow(showing);
		changeShowingState = () => {
			showing.value = false;
		};
	};

	const close = () => {
		if (changeShowingState != null) {
			changeShowingState();
			changeShowingState = null;
		}
	};

	const onMouseover = () => {
		if (isHovering) return;
		if (Date.now() < ignoreMouseoverUntil) return;
		isHovering = true;
		timeoutId = window.setTimeout(open, delay);
	};

	const onMouseleave = () => {
		if (!isHovering) return;
		isHovering = false;
		window.clearTimeout(timeoutId);
		close();
	};

	const onTouchstart = () => {
		ignoreMouseoverUntil = Date.now() + MOUSEOVER_IGNORE_DURATION;
		if (isHovering) return;
		isHovering = true;
		timeoutId = window.setTimeout(open, delay);
	};

	const onTouchend = () => {
		ignoreMouseoverUntil = Date.now() + MOUSEOVER_IGNORE_DURATION;
		if (!isHovering) return;
		isHovering = false;
		window.clearTimeout(timeoutId);
		close();
	};

	const stop = watch(
		elRef,
		(value, _oldValue, onCleanup) => {
			if (value == null) return;
			const el = value instanceof Element ? value : value.$el;
			el.addEventListener('mouseover', onMouseover, { passive: true });
			el.addEventListener('mouseleave', onMouseleave, { passive: true });
			el.addEventListener('touchstart', onTouchstart, { passive: true });
			el.addEventListener('touchend', onTouchend, { passive: true });
			el.addEventListener('touchcancel', onTouchend, { passive: true });
			el.addEventListener('click', close, { passive: true });

			onCleanup(() => {
				isHovering = false;
				window.clearTimeout(timeoutId);
				close();
				el.removeEventListener('mouseover', onMouseover);
				el.removeEventListener('mouseleave', onMouseleave);
				el.removeEventListener('touchstart', onTouchstart);
				el.removeEventListener('touchend', onTouchend);
				el.removeEventListener('touchcancel', onTouchend);
				el.removeEventListener('click', close);
			});
		},
		{
			immediate: true,
			flush: 'post',
		},
	);

	onUnmounted(() => {
		stop();
	});
}
