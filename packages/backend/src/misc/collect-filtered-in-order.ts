/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** filter を呼ぶ回数のデフォルトの上限。候補を最大 limit × この回数だけ見る。 */
const DEFAULT_MAX_BATCHES = 10;

/**
 * 候補 ID を limit 件ずつ filter へ渡し、残ったものを候補の順に最大 limit 件集める。
 * ID だけのタイムラインやランキングでは、ミュート・ブロック・公開範囲・削除済みを後から DB で落とすため、
 * 最初のバッチが全て除外されても後続の候補を調べる。ただし filter の呼び出しは maxBatches 回で打ち切るので、
 * 後続に候補が残っていても limit 件未満や空の結果になりうる。
 */
export async function collectFilteredInOrder<T extends { id: string }>(
	candidates: readonly string[],
	limit: number,
	filter: (ids: string[]) => Promise<T[]>,
	maxBatches: number = DEFAULT_MAX_BATCHES,
): Promise<T[]> {
	const collected: T[] = [];
	for (
		let offset = 0, batch = 0;
		offset < candidates.length && collected.length < limit && batch < maxBatches;
		offset += limit, batch++
	) {
		const ids = candidates.slice(offset, offset + limit);
		const byId = new Map((await filter(ids)).map((item) => [item.id, item]));
		for (const id of ids) {
			const item = byId.get(id);
			if (item != null) {
				collected.push(item);
				if (collected.length === limit) {
					break;
				}
			}
		}
	}
	return collected;
}
