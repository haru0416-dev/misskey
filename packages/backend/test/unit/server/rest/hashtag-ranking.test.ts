/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type * as Redis from 'ioredis';
import { loadConfig } from '@/config.js';
import type { Config } from '@/config.js';
import { createRedisClient } from '@/runtime-dependencies.js';
import { genId } from '@/misc/id/gen-id.js';
import { updateHashtagsRanking, updateHashtagsRankings } from '@/core/note/note-creation-service.js';
import { formatHashtagUsersWindow } from '@/core/hashtag/hashtag-ranking.js';
import { currentFeaturedWindow, HASHTAG_RANKING_WINDOW } from '@/core/featured/featured-ranking.js';

describe('updateHashtagsRanking', () => {
	let config: Config;
	let redis: Redis.Redis;

	beforeAll(() => {
		config = loadConfig();
		redis = createRedisClient(config);
	});

	afterAll(() => {
		redis.disconnect();
	});

	/** featured ランキング更新は fire-and-forget なので、zscore が現れるまで有界ポーリングする。 */
	async function pollFeaturedScore(tag: string): Promise<number | null> {
		const key = `featuredHashtagsRanking:${currentFeaturedWindow(HASHTAG_RANKING_WINDOW)}`;
		for (let i = 0; i < 20; i++) {
			const score = await redis.zscore(key, tag);
			if (score != null) {
				return Number(score);
			}
			await sleep(100);
		}
		return null;
	}

	function uniqueTag(): string {
		return `testtag${genId()}`.toLowerCase();
	}

	test('featured ランキング (zincrby)・チャート用 pfadd・ユニークカウント用 sadd が書き込まれる', async () => {
		const tag = uniqueTag();
		const userId = genId();

		const now = new Date();
		now.setMinutes(Math.floor(now.getMinutes() / 10) * 10, 0, 0);
		const window = formatHashtagUsersWindow(now);

		await updateHashtagsRanking({ meta: { hiddenTags: [], sensitiveWords: [] }, redis }, tag, userId);

		expect(await pollFeaturedScore(tag)).toBe(1);
		expect(await redis.sismember(`hashtagUsers:${tag}`, userId)).toBe(1);
		expect(await redis.pfcount(`hashtagUsers:${tag}:${window}`)).toBe(1);
	});

	test('同一ユーザーの2回目はランキングを加算しない (sismember スキップ)', async () => {
		const tag = uniqueTag();
		const userId = genId();
		const deps = { meta: { hiddenTags: [], sensitiveWords: [] }, redis };

		await updateHashtagsRanking(deps, tag, userId);
		expect(await pollFeaturedScore(tag)).toBe(1);

		await updateHashtagsRanking(deps, tag, userId);
		await sleep(300);
		expect(await pollFeaturedScore(tag)).toBe(1);
	});

	test('別ユーザーからの更新はランキングを加算する', async () => {
		const tag = uniqueTag();
		const deps = { meta: { hiddenTags: [], sensitiveWords: [] }, redis };

		await updateHashtagsRanking(deps, tag, genId());
		expect(await pollFeaturedScore(tag)).toBe(1);

		await updateHashtagsRanking(deps, tag, genId());
		for (let i = 0; i < 20; i++) {
			if ((await pollFeaturedScore(tag)) === 2) {
				break;
			}
			await sleep(100);
		}
		expect(await pollFeaturedScore(tag)).toBe(2);
	});

	test('複数タグを一括更新し、重複入力は1回だけ加算する', async () => {
		const tags = [uniqueTag(), uniqueTag()];
		const [firstTag, secondTag] = tags;
		if (firstTag == null || secondTag == null) {
			throw new Error('Failed to create hashtag fixtures');
		}
		const userId = genId();

		await updateHashtagsRankings(
			{ meta: { hiddenTags: [], sensitiveWords: [] }, redis },
			[firstTag, secondTag, firstTag],
			userId,
		);

		for (const tag of tags) {
			expect(await pollFeaturedScore(tag)).toBe(1);
			expect(await redis.sismember(`hashtagUsers:${tag}`, userId)).toBe(1);
		}
	});

	test('hiddenTags と sensitiveWords に含まれるタグは一切書き込まれない', async () => {
		const hiddenTag = uniqueTag();
		const sensitiveTag = uniqueTag();
		const userId = genId();
		const meta = { hiddenTags: [hiddenTag], sensitiveWords: [sensitiveTag] };

		await updateHashtagsRanking({ meta, redis }, hiddenTag, userId);
		await updateHashtagsRanking({ meta, redis }, sensitiveTag, userId);

		await sleep(300);
		for (const tag of [hiddenTag, sensitiveTag]) {
			expect(
				await redis.zscore(`featuredHashtagsRanking:${currentFeaturedWindow(HASHTAG_RANKING_WINDOW)}`, tag),
			).toBeNull();
			expect(await redis.sismember(`hashtagUsers:${tag}`, userId)).toBe(0);
		}
	});
});
