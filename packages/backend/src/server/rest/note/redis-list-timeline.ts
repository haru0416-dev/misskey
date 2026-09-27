/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';
import { collectFilteredInOrder } from '@/misc/collect-filtered-in-order.js';

/**
 * DB フォールバックを持たない Redis リストのタイムライン (アンテナ・ロール) から、範囲内のノートを
 * 新しい順 (sinceId だけ指定したときは古い順) に limit 件返す。
 * 候補は ID だけなので、ミュート・ブロック・公開範囲・削除済みは filter が DB で落とす (collectFilteredInOrder)。
 */
export async function collectRedisListTimelineNotes<T extends { id: string }>(
	redis: Pick<Redis.Redis, 'lrange'>,
	key: string,
	range: { sinceId: string | null; untilId: string | null; limit: number },
	filter: (ids: string[]) => Promise<T[]>,
): Promise<T[]> {
	const { sinceId, untilId, limit } = range;
	// 配布の再試行で同じ ID が二重に入り得る (fanout-timeline-push.ts)。重複は枠を食わないよう先に除く。
	const rawIds = [...new Set(await redis.lrange(key, 0, -1))];
	const candidates =
		untilId && sinceId
			? rawIds.filter((id) => id < untilId && id > sinceId).sort((a, b) => (a > b ? -1 : 1))
			: untilId
				? rawIds.filter((id) => id < untilId).sort((a, b) => (a > b ? -1 : 1))
				: sinceId
					? rawIds.filter((id) => id > sinceId).sort((a, b) => (a < b ? -1 : 1))
					: rawIds.toSorted((a, b) => (a > b ? -1 : 1));

	return await collectFilteredInOrder(candidates, limit, filter);
}
