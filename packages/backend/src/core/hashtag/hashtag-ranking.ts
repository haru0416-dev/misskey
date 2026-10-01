/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** hashtagUsers:* redis キーの時刻ウィンドウ文字列 (YYYYMMDDHHmm、10分間隔に丸めた Date を渡す)。 */
export function formatHashtagUsersWindow(now: Date): string {
	return `${now.getUTCFullYear()}${(now.getUTCMonth() + 1).toString().padStart(2, '0')}${now.getUTCDate().toString().padStart(2, '0')}${now.getUTCHours().toString().padStart(2, '0')}${now.getUTCMinutes().toString().padStart(2, '0')}`;
}
