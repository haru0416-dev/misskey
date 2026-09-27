/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** filter を呼ぶ回数の既定の上限。候補を最大 limit × この回数だけ見る。 */
const DEFAULT_MAX_BATCHES = 10;

/**
 * 並び順の決まった候補 ID を limit 件ずつ filter へ渡し、残ったものを候補の順に limit 件そろうまで集める。
 * 候補が ID だけのタイムラインやランキングでは、ミュート・ブロック・公開範囲・削除済みを後から DB で落とす。
 * 先に limit 件で切ってから落とすと、先頭が全部落ちたときに後ろの候補が残っていても空のページになり、
 * クライアントはそこで読み込みをやめる。次のページはここで返した最後の ID から続くので、途中で切っても抜けない。
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
