/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';

/**
 * DB フォールバックを持たない Redis リストのタイムライン (アンテナ・ロール) から、
 * 範囲内のノート ID を新しい順 (sinceId だけ指定したときは古い順) に limit 件返す。
 */
export async function listRedisListTimelineNoteIds(
	redis: Pick<Redis.Redis, 'lrange'>,
	key: string,
	range: { sinceId: string | null; untilId: string | null; limit: number },
): Promise<string[]> {
	const { sinceId, untilId } = range;
	// 配布の再試行で同じ ID が二重に入り得る (fanout-timeline-push.ts)。重複は枠を食わないよう先に除く。
	const rawIds = [...new Set(await redis.lrange(key, 0, -1))];
	const noteIds =
		untilId && sinceId
			? rawIds.filter((id) => id < untilId && id > sinceId).sort((a, b) => (a > b ? -1 : 1))
			: untilId
				? rawIds.filter((id) => id < untilId).sort((a, b) => (a > b ? -1 : 1))
				: sinceId
					? rawIds.filter((id) => id > sinceId).sort((a, b) => (a < b ? -1 : 1))
					: rawIds.toSorted((a, b) => (a > b ? -1 : 1));
	return noteIds.slice(0, range.limit);
}
