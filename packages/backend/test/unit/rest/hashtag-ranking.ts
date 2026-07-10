/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type * as Redis from 'ioredis';
import { loadConfig, type Config } from '@/config.js';
import { createRedisClient } from '@/runtime-dependencies.js';
import { genId } from '@/misc/id/gen-id.js';
import { updateHashtagsRankingForHonoApi, updateHashtagsRankingsForHonoApi } from '@/server/rest/notes-create.js';
import { formatHashtagUsersWindow, getCurrentFeaturedWindow, HASHTAG_RANKING_WINDOW } from '@/server/rest/hashtags.js';

describe('updateHashtagsRankingForHonoApi (HashtagService#updateHashtagsRanking 相当)', () => {
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
		const key = `featuredHashtagsRanking:${getCurrentFeaturedWindow(HASHTAG_RANKING_WINDOW)}`;
		for (let i = 0; i < 20; i++) {
			const score = await redis.zscore(key, tag);
			if (score != null) return Number(score);
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

		await updateHashtagsRankingForHonoApi({ meta: { hiddenTags: [], sensitiveWords: [] }, redis }, tag, userId);

		expect(await pollFeaturedScore(tag)).toBe(1);
		expect(await redis.sismember(`hashtagUsers:${tag}`, userId)).toBe(1);
		expect(await redis.pfcount(`hashtagUsers:${tag}:${window}`)).toBe(1);
	});

	test('同一ユーザーの2回目はランキングを加算しない (sismember スキップ)', async () => {
		const tag = uniqueTag();
		const userId = genId();
		const deps = { meta: { hiddenTags: [], sensitiveWords: [] }, redis };

		await updateHashtagsRankingForHonoApi(deps, tag, userId);
		expect(await pollFeaturedScore(tag)).toBe(1);

		await updateHashtagsRankingForHonoApi(deps, tag, userId);
		await sleep(300);
		expect(await pollFeaturedScore(tag)).toBe(1);
	});

	test('別ユーザーからの更新はランキングを加算する', async () => {
		const tag = uniqueTag();
		const deps = { meta: { hiddenTags: [], sensitiveWords: [] }, redis };

		await updateHashtagsRankingForHonoApi(deps, tag, genId());
		expect(await pollFeaturedScore(tag)).toBe(1);

		await updateHashtagsRankingForHonoApi(deps, tag, genId());
		for (let i = 0; i < 20; i++) {
			if (await pollFeaturedScore(tag) === 2) break;
			await sleep(100);
		}
		expect(await pollFeaturedScore(tag)).toBe(2);
	});

	test('複数タグを一括更新し、重複入力は1回だけ加算する', async () => {
		const tags = [uniqueTag(), uniqueTag()];
		const userId = genId();

		await updateHashtagsRankingsForHonoApi(
			{ meta: { hiddenTags: [], sensitiveWords: [] }, redis },
			[tags[0], tags[1], tags[0]],
			userId,
		);

		for (const tag of tags) {
			expect(await pollFeaturedScore(tag)).toBe(1);
			expect(await redis.sismember(`hashtagUsers:${tag}`, userId)).toBe(1);
		}
	});

	test('hiddenTags に含まれるタグは一切書き込まれない', async () => {
		const tag = uniqueTag();
		const userId = genId();

		await updateHashtagsRankingForHonoApi({ meta: { hiddenTags: [tag], sensitiveWords: [] }, redis }, tag, userId);

		await sleep(300);
		expect(await redis.zscore(`featuredHashtagsRanking:${getCurrentFeaturedWindow(HASHTAG_RANKING_WINDOW)}`, tag)).toBeNull();
		expect(await redis.sismember(`hashtagUsers:${tag}`, userId)).toBe(0);
	});

	test('sensitiveWords にマッチするタグは一切書き込まれない', async () => {
		const tag = uniqueTag();
		const userId = genId();

		await updateHashtagsRankingForHonoApi({ meta: { hiddenTags: [], sensitiveWords: [tag] }, redis }, tag, userId);

		await sleep(300);
		expect(await redis.zscore(`featuredHashtagsRanking:${getCurrentFeaturedWindow(HASHTAG_RANKING_WINDOW)}`, tag)).toBeNull();
		expect(await redis.sismember(`hashtagUsers:${tag}`, userId)).toBe(0);
	});
});
