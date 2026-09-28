/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * datetime-local の入力欄に入れる、手元のタイムゾーンでの 'YYYY-MM-DDTHH:mm'。
 * 時差はその日時のものを使う (夏時間の前後で変わる)。入力欄の値は `new Date(value)` が同じ規則で手元の時刻として読むので、
 * 分単位で元の時刻に戻る。今日の時差を全日時に使うと、夏時間をまたぐ日時が 1 時間ずれる。
 * 例外は夏時間が終わって同じ時刻が 2 回来る 1 時間で、値に時差を持てないため 1 回目の時刻として読まれる。
 */
export function toDatetimeLocalValue(time: number | string | Date): string {
	const date = new Date(time);
	const pad = (value: number) => String(value).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
