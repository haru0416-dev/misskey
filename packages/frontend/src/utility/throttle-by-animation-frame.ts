/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type AnimationFrameThrottled<T extends unknown[]> = ((...args: T) => void) & {
	cancel: () => void;
	flush: () => void;
};

export function throttleByAnimationFrame<T extends unknown[]>(callback: (...args: T) => void): AnimationFrameThrottled<T> {
	let frameId: number | null = null;
	let latestArgs: T | null = null;

	const invoke = () => {
		const argsToUse = latestArgs;
		latestArgs = null;
		if (argsToUse != null) callback(...argsToUse);
	};

	const throttled = ((...args: T) => {
		latestArgs = args;
		if (frameId != null) return;

		frameId = window.requestAnimationFrame(() => {
			frameId = null;
			invoke();
		});
	}) as AnimationFrameThrottled<T>;

	throttled.cancel = () => {
		if (frameId != null) {
			window.cancelAnimationFrame(frameId);
			frameId = null;
		}
		latestArgs = null;
	};

	throttled.flush = () => {
		if (frameId == null) return;
		window.cancelAnimationFrame(frameId);
		frameId = null;
		invoke();
	};

	return throttled;
}
