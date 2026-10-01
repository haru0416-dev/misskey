/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref, readonly, computed } from 'vue';

const time = ref(Date.now());

export const TIME_UPDATE_INTERVAL = 10_000;

/**
 * 全コンポーネントで共有する時計。表示中だけ 10 秒ごとに更新し、表示復帰時にも更新する。
 * 初回参照より古い値を避けたい場合は useLowresTime を使う。
 */
export const lowresTime = readonly(time);

/**
 * 呼び出し時の時刻を下限として共有時計を参照する。読み取り時点の現在時刻を保証するものではない。
 */
export function useLowresTime() {
	const now = Date.now();
	return computed(() => Math.max(time.value, now));
}

let intervalId: number | null = null;

function updateTime() {
	time.value = Date.now();
}

function startTimer() {
	updateTime();
	if (intervalId != null) {
		return;
	}
	intervalId = window.setInterval(updateTime, TIME_UPDATE_INTERVAL);
}

function stopTimer() {
	if (intervalId == null) {
		return;
	}
	window.clearInterval(intervalId);
	intervalId = null;
}

function onVisibilityChange() {
	if (window.document.visibilityState === 'hidden') {
		stopTimer();
	} else {
		startTimer();
	}
}

if (window.document.visibilityState !== 'hidden') {
	startTimer();
}
window.document.addEventListener('visibilitychange', onVisibilityChange);
