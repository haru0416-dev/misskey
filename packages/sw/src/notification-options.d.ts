/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 通知のアクションボタンと再通知は Chromium 系だけの実装で、標準の NotificationOptions に無い
// (@types/serviceworker 0.0.75 以降は型からも消えている)。非対応ブラウザでは無視されるだけなので型の上でだけ足す。
declare global {
	interface NotificationOptions {
		actions?: NotificationAction[];
		renotify?: boolean;
	}
}

export {};
