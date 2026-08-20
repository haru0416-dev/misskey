/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { markRaw } from 'vue';
import { $i } from '@/i.js';
import { wsOrigin } from '@shared/utility/config.js';

// ハートビートの間隔（ミリ秒）。
const HEART_BEAT_INTERVAL = 1000 * 60;

let stream: Misskey.IStream | null = null;
let timeoutHeartBeat: number | null = null;
let lastHeartbeatCall = 0;

function clearHeartbeatTimer(): void {
	if (timeoutHeartBeat == null) return;
	window.clearTimeout(timeoutHeartBeat);
	timeoutHeartBeat = null;
}

function scheduleHeartbeat(delay = HEART_BEAT_INTERVAL): void {
	clearHeartbeatTimer();
	timeoutHeartBeat = window.setTimeout(heartbeat, delay);
}

export function useStream(): Misskey.IStream {
	if (stream) return stream;

	stream = markRaw(
		new Misskey.Stream(
			wsOrigin,
			$i
				? {
						token: $i.token,
					}
				: null,
		),
	);

	scheduleHeartbeat();

	// 前回の送信から間隔以上経過していれば、表示復帰時にすぐ送信する。
	window.document.addEventListener('visibilitychange', () => {
		if (!stream) return;
		if (window.document.visibilityState !== 'visible') {
			clearHeartbeatTimer();
			return;
		}

		const elapsed = Date.now() - lastHeartbeatCall;
		if (elapsed >= HEART_BEAT_INTERVAL) {
			heartbeat();
		} else {
			scheduleHeartbeat(HEART_BEAT_INTERVAL - elapsed);
		}
	});

	return stream;
}

function heartbeat(): void {
	if (stream == null || window.document.visibilityState !== 'visible') {
		clearHeartbeatTimer();
		return;
	}
	stream.heartbeat();
	lastHeartbeatCall = Date.now();
	scheduleHeartbeat();
}
