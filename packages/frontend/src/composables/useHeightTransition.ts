/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type HeightTransitionOptions = {
	/**
	 * enter時にコンテンツの高さをこの値でクランプする (未指定/nullなら無制限)
	 */
	maxHeight?: () => number | null;
};

/**
 * v-show 用の高さアニメーション。height: auto は直接アニメーションできないため、
 * 遷移中だけ実測した高さを指定し、終了後は自然高さへ戻す。
 */
export function useHeightTransition(options: HeightTransitionOptions = {}) {
	function enter(el: Element) {
		if (!(el instanceof HTMLElement)) {
			return;
		}

		// 中断されたleaveが残したインラインheightを除去してから自然高さを測る。
		// 残ったheightを測ると、折りたたまれた高さを自然高さとして扱ってしまう。
		el.style.height = '';
		const elementHeight = el.getBoundingClientRect().height;
		const maxHeight = options.maxHeight?.() ?? Infinity;
		el.style.height = '0';
		el.offsetHeight; // レイアウトを確定させるために再計算を強制する。
		el.style.height = `${Math.min(elementHeight, maxHeight)}px`;
	}

	function afterEnter(el: Element) {
		if (!(el instanceof HTMLElement)) {
			return;
		}

		el.style.height = '';
	}

	function leave(el: Element) {
		if (!(el instanceof HTMLElement)) {
			return;
		}

		const elementHeight = el.getBoundingClientRect().height;
		el.style.height = `${elementHeight}px`;
		el.offsetHeight; // 開始時の高さを確定させてから、折りたたみ先の高さを指定する。
		el.style.height = '0';
	}

	function afterLeave(el: Element) {
		if (!(el instanceof HTMLElement)) {
			return;
		}

		el.style.height = '';
	}

	return { enter, afterEnter, leave, afterLeave };
}
