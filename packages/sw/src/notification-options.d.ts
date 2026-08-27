/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/*
 * 通知のアクションボタンと再通知は Chromium 系だけが実装しており、標準の
 * NotificationOptions には含まれない (@types/serviceworker は 0.0.75 以降
 * これらを落としている)。対応していないブラウザでは無視されるだけなので、
 * 型の上でだけ足す。
 */
declare global {
	interface NotificationOptions {
		actions?: NotificationAction[];
		renotify?: boolean;
	}
}

export {};
