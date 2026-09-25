/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';

/**
 * アンテナのキーワード行列 (外側が OR、内側が AND)。照合は投稿ごと・アンテナごとに
 * キーワード数 × 本文長の部分一致になるため、行列の大きさを制限する。上限いっぱいの 1,000 語でも、
 * 3,000 字の本文で 1 投稿 1 アンテナあたり約 0.3 ms。
 */
export const antennaKeywordMatrixSchema = z.array(z.array(z.string().max(200)).max(10)).max(100);

/** 空の語と空のまとまりを除く。 */
export function compactAntennaKeywords(matrix: string[][]): string[][] {
	return matrix.map((group) => group.filter((keyword) => keyword !== '')).filter((group) => group.length > 0);
}

/**
 * いずれかのまとまりの語がすべて本文に含まれるか。大文字小文字を区別しない場合は本文を 1 度だけ小文字にする
 * (語ごとに本文を小文字にし直すと、キーワード 1,600 語・3,000 字で 10 ms かかる)。
 */
export function matchesAntennaKeywords(text: string, matrix: string[][], caseSensitive: boolean): boolean {
	const haystack = caseSensitive ? text : text.toLowerCase();
	return matrix.some((group) =>
		group.every((keyword) => haystack.includes(caseSensitive ? keyword : keyword.toLowerCase())),
	);
}
