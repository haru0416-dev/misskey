/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 通知のアクションボタンと再通知に使う型定義を補う。非対応ブラウザではこれらのオプションは無視される。
declare global {
	interface NotificationOptions {
		actions?: NotificationAction[];
		renotify?: boolean;
	}
}

export {};
