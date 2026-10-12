/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const DAY = 1000 * 60 * 60 * 24;

/**
 * 継続率の集計はサーバーの 0 時に走り、直前 24 時間に登録したユーザーを 1 行にする。行の dateKey と、
 * 以後の集計で足される data のキーは、どちらもサーバーの日付をゼロ埋めなしの Y-M-D で書いたもの。
 * 閲覧者のタイムゾーンを混ぜないよう、暦の日付として通し番号にして引き算する。
 */
export function retentionDayNumber(key: string): number | null {
	const match = /^(\d+)-(\d+)-(\d+)$/.exec(key);
	if (match == null) return null;
	return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY;
}

/** 行の dateKey は登録期間の終わりの日なので、登録日はその前日。表示は暦の日付のまま行う。 */
export function retentionSignupDate(dateKey: string, options: Intl.DateTimeFormatOptions): string | null {
	const day = retentionDayNumber(dateKey);
	if (day == null) return null;
	return new Date((day - 1) * DAY).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' });
}

/** data のキーごとに、登録期間の終わりから何日後の集計かを出す。キーが読めない行は落とす。 */
export function retentionValuesByDay(record: { dateKey: string; data: Record<string, number> }): Map<number, number> {
	const values = new Map<number, number>();
	const base = retentionDayNumber(record.dateKey);
	if (base == null) return values;
	for (const [key, value] of Object.entries(record.data)) {
		const day = retentionDayNumber(key);
		if (day != null) values.set(day - base, value);
	}
	return values;
}
