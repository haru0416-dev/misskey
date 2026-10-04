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

	function uniqueTag(): string {
		return `testtag${genId()}`.toLowerCase();
	}

	test('単一・一括更新で重複タグと同一ユーザーを除き、別ユーザーだけランキングに加算する', async () => {
		const tags = [uniqueTag(), uniqueTag()];
		const [firstTag, secondTag] = tags;
		if (firstTag == null || secondTag == null) {
			throw new Error('Failed to create hashtag fixtures');
		}
		const userId = genId();

		const deps = { meta: { hiddenTags: [], sensitiveWords: [] }, redis };
		const now = new Date();
		now.setMinutes(Math.floor(now.getMinutes() / 10) * 10, 0, 0);
		const window = formatHashtagUsersWindow(now);
		const featuredKey = `featuredHashtagsRanking:${currentFeaturedWindow(HASHTAG_RANKING_WINDOW)}`;

		await updateHashtagsRanking(deps, firstTag, userId);
		await updateHashtagsRankings(deps, [firstTag, secondTag, secondTag], userId);

		for (const tag of tags) {
			expect(Number(await redis.zscore(featuredKey, tag))).toBe(1);
			expect(await redis.sismember(`hashtagUsers:${tag}`, userId)).toBe(1);
			expect(await redis.pfcount(`hashtagUsers:${tag}:${window}`)).toBe(1);
		}

		await updateHashtagsRankings(deps, tags, userId);
		for (const tag of tags) {
			expect(Number(await redis.zscore(featuredKey, tag))).toBe(1);
		}

		await updateHashtagsRankings(deps, tags, genId());
		for (const tag of tags) {
			expect(Number(await redis.zscore(featuredKey, tag))).toBe(2);
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
