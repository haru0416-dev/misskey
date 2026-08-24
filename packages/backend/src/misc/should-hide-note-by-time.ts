/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * ノートが指定された時間条件に基づいて非表示対象かどうかを判定する
 * @param hiddenBefore 非表示条件（負の値: 作成からの経過秒数、正の値: UNIXタイムスタンプ秒、null: 判定しない）
 * @param createdAt ノートの作成日時（ISO 8601形式の文字列 または Date オブジェクト）
 * @returns 非表示にすべき場合は true
 */
export function shouldHideNoteByTime(hiddenBefore: number | null | undefined, createdAt: string | Date): boolean {
	if (hiddenBefore == null) {
		return false;
	}

	const createdAtTime = typeof createdAt === 'string' ? new Date(createdAt).getTime() : createdAt.getTime();

	// NOTE(rust): hiddenBefore===0 がこの <=0 分岐で「0秒以上経過=ほぼ全ノート非表示」になるのは upstream 由来の
	// 意図的仕様(単体テスト test/unit/misc/should-hide-note-by-time.ts が 0→hide を明示アサート)。バグに見えるが
	// 「直さない」こと(< 0 に変えるとそのテストの意図を壊す)
	if (hiddenBefore <= 0) {
		const elapsedSeconds = (Date.now() - createdAtTime) / 1000;
		const hideAfterSeconds = Math.abs(hiddenBefore);
		return elapsedSeconds >= hideAfterSeconds;
	} else {
		const createdAtSeconds = createdAtTime / 1000;
		return createdAtSeconds <= hiddenBefore;
	}
}
