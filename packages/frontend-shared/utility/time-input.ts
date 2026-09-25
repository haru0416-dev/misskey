/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// frontend の MkTime と embed の EmTime が共有する、時刻入力の解釈。
// 相対表記の文言選択は共有しない。ロケールのビルド時インライン化は各アプリの i18n を直接参照した
// `i18n.tsx.*` 呼び出ししか置換できず、i18n を引数で渡すとビルドがエラーになるため。

/** 解釈できない値は NaN を返す。 */
export function toTimeMs(time: Date | string | number | null): number {
	if (time == null) {
		return Number.NaN;
	}
	try {
		if (time instanceof Date) {
			return time.getTime();
		}
		return new Date(time).getTime();
	} catch {
		return Number.NaN;
	}
}
