/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type HeightTransitionOptions = {
	/**
	 * enter時にコンテンツの高さをこの値でクランプする (未指定/nullなら無制限)
	 */
	maxHeight?: () => number | null;

	/**
	 * trueを返す間は高さの手動アニメーションをスキップする
	 * (例: CSSの interpolate-size に対応済みのブラウザではJS側の高さ操作が不要なため)
	 */
	skip?: () => boolean;
};

/**
 * v-show と組み合わせた <Transition> で、要素の高さをアニメーションさせるための
 * enter/afterEnter/leave/afterLeave ハンドラを提供する。
 * height: auto はそのままではtransitionできないため、reflowを挟んで実際の高さ(px)を
 * 一時的に指定することでアニメーションを成立させている。
 */
export function useHeightTransition(options: HeightTransitionOptions = {}) {
	function enter(el: Element) {
		if (options.skip?.()) return;
		if (!(el instanceof HTMLElement)) return;

		const elementHeight = el.getBoundingClientRect().height;
		const maxHeight = options.maxHeight?.() ?? Infinity;
		el.style.height = '0';
		el.offsetHeight; // reflow
		el.style.height = `${Math.min(elementHeight, maxHeight)}px`;
	}

	function afterEnter(el: Element) {
		if (options.skip?.()) return;
		if (!(el instanceof HTMLElement)) return;

		el.style.height = '';
	}

	function leave(el: Element) {
		if (options.skip?.()) return;
		if (!(el instanceof HTMLElement)) return;

		const elementHeight = el.getBoundingClientRect().height;
		el.style.height = `${elementHeight}px`;
		el.offsetHeight; // reflow
		el.style.height = '0';
	}

	function afterLeave(el: Element) {
		if (options.skip?.()) return;
		if (!(el instanceof HTMLElement)) return;

		el.style.height = '';
	}

	return { enter, afterEnter, leave, afterLeave };
}
