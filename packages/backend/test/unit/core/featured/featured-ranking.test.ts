/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type * as Redis from 'ioredis';
import { loadConfig } from '@/config.js';
import { createRedisClient } from '@/runtime-dependencies.js';
import { genId } from '@/misc/id/gen-id.js';
import {
	currentFeaturedWindow,
	GLOBAL_NOTES_RANKING_WINDOW,
	HASHTAG_RANKING_WINDOW,
	PER_USER_NOTES_RANKING_WINDOW,
	readFeaturedRanking,
	recordFeaturedNoteEngagement,
} from '@/core/featured/featured-ranking.js';
import type { FeaturedNoteTarget } from '@/core/featured/featured-ranking.js';
import { formatHashtagUsersWindow } from '@/core/hashtag/hashtag-ranking.js';
import { handleApiHashtagsTrend } from '@/server/rest/hashtag/hashtags.js';
import type { HashtagDependencies } from '@/server/rest/hashtag/hashtags.js';

describe('FeaturedRanking', () => {
	let redis: Redis.Redis;

	beforeAll(() => {
		redis = createRedisClient(loadConfig());
	});

	afterAll(() => {
		redis.disconnect();
	});

	test('今の窓と前の窓を合わせた点数の高い順に、上位だけを返す', async () => {
		const name = `featuredTestRanking${genId()}`;
		const window = currentFeaturedWindow(GLOBAL_NOTES_RANKING_WINDOW);
		// 前の窓だけにある b が、今の窓の a より高い。c は両方にあり平均 (10 + 2) / 2 = 6。
		await redis.zadd(`${name}:${window}`, 5, 'a', 10, 'c', 1, 'd');
		await redis.zadd(`${name}:${window - 1}`, 8, 'b', 2, 'c');

		expect(await readFeaturedRanking(redis, name, GLOBAL_NOTES_RANKING_WINDOW, 3)).toEqual(['b', 'c', 'a']);
		await redis.del(`${name}:${window}`, `${name}:${window - 1}`);
	});

	describe('recordFeaturedNoteEngagement', () => {
		const note = (values: Partial<FeaturedNoteTarget> = {}): FeaturedNoteTarget => ({
			id: genId(),
			userId: genId(),
			userHost: null,
			visibility: 'public',
			replyId: null,
			channelId: null,
			...values,
		});
		const scoreOf = async (name: string, windowRange: number, id: string) =>
			await redis.zscore(`${name}:${currentFeaturedWindow(windowRange)}`, id);

		test('公開のローカル投稿は全体とユーザー別に数える', async () => {
			const target = note();
			await recordFeaturedNoteEngagement(redis, target, 5);
			expect(await scoreOf('featuredGlobalNotesRanking', GLOBAL_NOTES_RANKING_WINDOW, target.id)).toBe('5');
			expect(
				await scoreOf(`featuredPerUserNotesRanking:${target.userId}`, PER_USER_NOTES_RANKING_WINDOW, target.id),
			).toBe('5');
			await redis.zrem(`featuredGlobalNotesRanking:${currentFeaturedWindow(GLOBAL_NOTES_RANKING_WINDOW)}`, target.id);
		});

		test('チャンネルの投稿はチャンネル内だけに数える', async () => {
			const channelId = genId();
			const target = note({ channelId });
			await recordFeaturedNoteEngagement(redis, target, 1);
			expect(await scoreOf(`featuredInChannelNotesRanking:${channelId}`, GLOBAL_NOTES_RANKING_WINDOW, target.id)).toBe(
				'1',
			);
			expect(await scoreOf('featuredGlobalNotesRanking', GLOBAL_NOTES_RANKING_WINDOW, target.id)).toBeNull();
		});

		test('返信・公開以外・リモート・3 日より前の投稿は数えない', async () => {
			const old = note({ id: genId(Date.now() - GLOBAL_NOTES_RANKING_WINDOW - 1000) });
			for (const target of [
				note({ replyId: genId() }),
				note({ visibility: 'home' }),
				note({ userHost: 'remote.example' }),
				old,
			]) {
				await recordFeaturedNoteEngagement(redis, target, 1);
				expect(await scoreOf('featuredGlobalNotesRanking', GLOBAL_NOTES_RANKING_WINDOW, target.id)).toBeNull();
				expect(
					await scoreOf(`featuredPerUserNotesRanking:${target.userId}`, PER_USER_NOTES_RANKING_WINDOW, target.id),
				).toBeNull();
			}
		});
	});

	test('ハッシュタグのトレンドのグラフは 10 分ごとの窓を新しい順に並べる', async () => {
		const tag = `trendtag${genId()}`.toLowerCase();
		const rankingKey = `featuredHashtagsRanking:${currentFeaturedWindow(HASHTAG_RANKING_WINDOW)}`;
		// 共有の Redis に他のテストのタグもあるので、点数を大きくして必ず上位に入れる。
		await redis.zadd(rankingKey, 1e9, tag);
		const window = new Date();
		window.setMinutes(Math.floor(window.getMinutes() / 10) * 10, 0, 0);
		const keys: string[] = [];
		for (let i = 0; i < 4; i++) {
			const key = `hashtagUsers:${tag}:${formatHashtagUsersWindow(window)}`;
			keys.push(key);
			await redis.pfadd(key, ...Array.from({ length: i + 1 }, (_, j) => `user${j}`));
			window.setMinutes(window.getMinutes() - 10, 0, 0);
		}

		try {
			const trend = await handleApiHashtagsTrend({ redis } as unknown as HashtagDependencies, {});
			const chart = trend.find((entry) => entry.tag === tag)?.chart;
			expect(chart?.slice(0, 4)).toEqual([1, 2, 3, 4]);
			expect(chart).toHaveLength(20);
		} finally {
			await redis.zrem(rankingKey, tag);
			await redis.del(...keys);
		}
	});
});
