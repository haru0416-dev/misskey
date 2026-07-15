/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function makeDoubleTapDetector(onDoubletap: (event: TouchEvent) => void) {
	const positionThreshold = 10;
	const durationThreshold = 300;

	let lastTapTime = 0;
	let lastTapPosition = { x: 0, y: 0 };

	function onTouchstart(ev: TouchEvent) {
		if (ev.touches.length !== 1) return;
		const touch = ev.touches[0];
		if (touch == null) return;

		const currentTime = Date.now();
		const tapLength = currentTime - lastTapTime;
		const positionDelta = Math.max(
			Math.abs(touch.clientX - lastTapPosition.x),
			Math.abs(touch.clientY - lastTapPosition.y),
		);

		if (tapLength < durationThreshold && tapLength > 0 && positionDelta < positionThreshold) {
			onDoubletap(ev);
			lastTapTime = 0;
			return;
		}

		lastTapTime = currentTime;
		lastTapPosition = {
			x: touch.clientX,
			y: touch.clientY,
		};
	}

	function onTouchmove(ev: TouchEvent) {
		if (ev.touches.length === 0) return;
		const touch = ev.touches[0];
		if (touch == null) return;
		const positionDelta = Math.max(
			Math.abs(touch.clientX - lastTapPosition.x),
			Math.abs(touch.clientY - lastTapPosition.y),
		);
		if (positionDelta > positionThreshold) lastTapTime = 0;
	}

	function reset() {
		lastTapTime = 0;
		lastTapPosition = { x: 0, y: 0 };
	}

	return { onTouchstart, onTouchmove, reset };
}
