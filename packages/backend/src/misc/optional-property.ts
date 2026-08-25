/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 値があるときだけキーを置くオブジェクトを作る。
 *
 * `exactOptionalPropertyTypes` の下では `{ key: undefined }` が省略可能プロパティに代入できないため、
 * `...(v == null ? {} : { key: v })` と書く必要がある。この形はキー名を2回書くので取り違えやすく、
 * 入れ子のオブジェクトリテラルの中では特に読みにくい。
 */
export function optionalProperty<K extends string, V>(key: K, value: V | null | undefined): { [P in K]?: V } {
	return (value == null ? {} : { [key]: value }) as { [P in K]?: V };
}
