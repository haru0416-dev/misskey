/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref, readonly, computed } from 'vue';

const time = ref(Date.now());

export const TIME_UPDATE_INTERVAL = 10000; // 10秒

/**
 * 精度が求められないが定期的に更新しないといけない時計で使用（10秒に一度更新）。
 * tickを各コンポーネントで行うのではなく、ここで一括して行うことでパフォーマンスを改善する。
 *
 * ※ マウント前の時刻を返す可能性があるため、通常は`useLowresTime`を使用する
 */
export const lowresTime = readonly(time);

/**
 * 精度が求められないが定期的に更新しないといけない時計で使用（10秒に一度更新）。
 * tickを各コンポーネントで行うのではなく、ここで一括して行うことでパフォーマンスを改善する。
 *
 * 必ず現在時刻以降を返すことを保証するコンポーサブル
 */
export function useLowresTime() {
	// lowresTime自体はマウント前の時刻を返す可能性があるため、必ず現在時刻以降を返すことを保証する
	const now = Date.now();
	return computed(() => Math.max(time.value, now));
}

let intervalId: number | null = null;

function updateTime() {
	time.value = Date.now();
}

function startTimer() {
	updateTime();
	if (intervalId != null) return;
	intervalId = window.setInterval(updateTime, TIME_UPDATE_INTERVAL);
}

function stopTimer() {
	if (intervalId == null) return;
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
