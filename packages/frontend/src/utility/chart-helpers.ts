/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * dateTimeAxisLabel系のday単位チャートで使う、「now から ago 日前」の日付を返す
 */
export function getDateDaysAgo(now: Date, ago: number): Date {
	const y = now.getFullYear();
	const m = now.getMonth();
	const d = now.getDate();

	return new Date(y, m, d - ago);
}

/**
 * day単位で並んだ数値配列を、時系列グラフ用の { x: timestamp, y: value } 系列に変換する
 * (配列のインデックスがそのまま「now から何日前か」に対応する)
 */
export function toChartSeries(now: Date, values: number[]): { x: number; y: number }[] {
	return values.map((v, i) => ({
		x: getDateDaysAgo(now, i).getTime(),
		y: v,
	}));
}
