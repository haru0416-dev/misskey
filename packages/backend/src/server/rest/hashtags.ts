/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';
import { z } from 'zod';
import {
	fetchHashtagByNameFromDatabase,
	listHashtagsFromDatabase,
	searchHashtagNamesFromDatabase,
	type HashtagSort,
} from '@/core/HashtagStore.js';
import {
	listUsersByTagFromDatabase,
	type UserListOrigin,
	type UserListSort,
	type UserListState,
} from '@/core/UserStore.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import { safeForSql } from '@/misc/safe-for-sql.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiHashtag } from '@/models/Hashtag.js';
import type { MiUser } from '@/models/User.js';
import { HonoApiError } from './error.js';
import {
	packUserDetailedManyForHonoApi,
	type MeDetailedHonoApiResponse,
	type UserDetailedNotMeHonoApiResponse,
	type UserPackingDependencies,
} from './user.js';
import { parseHonoApiParams } from './validation.js';

export const HASHTAG_RANKING_WINDOW = 1000 * 60 * 60;
const featuredEpoc = new Date('2023-01-01T00:00:00Z').getTime();

export type HonoApiHashtagDependencies = UserPackingDependencies & {
	redis: Redis.Redis;
};

export const hashtagsTrendParamDef = z.object({});

export const hashtagsListParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(10),
	attachedToUserOnly: z.boolean().optional().default(false),
	attachedToLocalUserOnly: z.boolean().optional().default(false),
	attachedToRemoteUserOnly: z.boolean().optional().default(false),
	sort: z.enum([
		'+mentionedUsers',
		'-mentionedUsers',
		'+mentionedLocalUsers',
		'-mentionedLocalUsers',
		'+mentionedRemoteUsers',
		'-mentionedRemoteUsers',
		'+attachedUsers',
		'-attachedUsers',
		'+attachedLocalUsers',
		'-attachedLocalUsers',
		'+attachedRemoteUsers',
		'-attachedRemoteUsers',
	]),
});

export const hashtagsSearchParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(10),
	query: z.string(),
	offset: z.number().int().optional().default(0),
});

export const hashtagsShowParamDef = z.object({
	tag: z.string(),
});

export function getCurrentFeaturedWindow(windowRange: number): number {
	const passed = new Date().getTime() - featuredEpoc;
	return Math.floor(passed / windowRange);
}

/** hashtagUsers:* redis キーの時刻ウィンドウ文字列 (YYYYMMDDHHmm、10分間隔に丸めた Date を渡す)。 */
export function formatHashtagUsersWindow(now: Date): string {
	return `${now.getUTCFullYear()}${(now.getUTCMonth() + 1).toString().padStart(2, '0')}${now.getUTCDate().toString().padStart(2, '0')}${now.getUTCHours().toString().padStart(2, '0')}${now.getUTCMinutes().toString().padStart(2, '0')}`;
}

async function getFeaturedRanking(
	redis: Redis.Redis,
	name: string,
	windowRange: number,
	threshold: number,
): Promise<string[]> {
	const currentWindow = getCurrentFeaturedWindow(windowRange);
	const previousWindow = currentWindow - 1;

	const redisPipeline = redis.pipeline();
	redisPipeline.zrange(`${name}:${currentWindow}`, 0, String(threshold), 'REV', 'WITHSCORES');
	redisPipeline.zrange(`${name}:${previousWindow}`, 0, String(threshold), 'REV', 'WITHSCORES');
	const [currentRankingResult = [], previousRankingResult = []] = await redisPipeline
		.exec()
		.then((result) => (result ? result.map((r) => (r[1] ?? []) as string[]) : []));

	const ranking = new Map<string, number>();
	for (let i = 0; i < currentRankingResult.length; i += 2) {
		const noteId = currentRankingResult[i];
		const scoreValue = currentRankingResult[i + 1];
		if (noteId == null || scoreValue == null) continue;
		const score = Number.parseInt(scoreValue, 10);
		ranking.set(noteId, score);
	}
	for (let i = 0; i < previousRankingResult.length; i += 2) {
		const noteId = previousRankingResult[i];
		const scoreValue = previousRankingResult[i + 1];
		if (noteId == null || scoreValue == null) continue;
		const score = Number.parseInt(scoreValue, 10);
		const exist = ranking.get(noteId);
		if (exist != null) {
			ranking.set(noteId, (exist + score) / 2);
		} else {
			ranking.set(noteId, score);
		}
	}

	return Array.from(ranking.keys());
}

async function getHashtagCharts(
	redis: Redis.Redis,
	hashtags: string[],
	range: number,
): Promise<Record<string, number[]>> {
	const now = new Date();
	now.setMinutes(Math.floor(now.getMinutes() / 10) * 10, 0, 0);

	const redisPipeline = redis.pipeline();

	for (let i = 0; i < range; i++) {
		const window = formatHashtagUsersWindow(now);
		for (const hashtag of hashtags) {
			redisPipeline.pfcount(`hashtagUsers:${hashtag}:${window}`);
		}
		now.setMinutes(now.getMinutes() - i * 10, 0, 0);
	}

	const result = await redisPipeline.exec();
	if (result == null) return {};

	const charts: Record<string, number[]> = {};
	for (const hashtag of hashtags) {
		charts[hashtag] = [];
	}

	for (let i = 0; i < range; i++) {
		for (let j = 0; j < hashtags.length; j++) {
			const hashtag = hashtags[j];
			const entry = result[i * hashtags.length + j];
			if (hashtag == null || entry == null || typeof entry[1] !== 'number')
				throw new Error('Hashtag chart pipeline returned an incomplete result');
			const chart = charts[hashtag];
			if (chart == null) throw new Error(`Hashtag chart is missing for ${hashtag}`);
			chart.push(entry[1]);
		}
	}

	return charts;
}

function noSuchHashtagError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such hashtag.',
		code: 'NO_SUCH_HASHTAG',
		id: '110ee688-193e-4a3a-9ecf-c167b2e6981e',
	});
}

function packHonoApiHashtag(src: MiHashtag): Packed<'Hashtag'> {
	return {
		tag: src.name,
		mentionedUsersCount: src.mentionedUsersCount,
		mentionedLocalUsersCount: src.mentionedLocalUsersCount,
		mentionedRemoteUsersCount: src.mentionedRemoteUsersCount,
		attachedUsersCount: src.attachedUsersCount,
		attachedLocalUsersCount: src.attachedLocalUsersCount,
		attachedRemoteUsersCount: src.attachedRemoteUsersCount,
	};
}

export async function handleHonoApiHashtagsTrend(
	deps: HonoApiHashtagDependencies,
	body: Record<string, unknown>,
): Promise<
	{
		tag: string;
		chart: number[];
		usersCount: number;
	}[]
> {
	parseHonoApiParams(hashtagsTrendParamDef, body);
	const ranking = await getFeaturedRanking(deps.redis, 'featuredHashtagsRanking', HASHTAG_RANKING_WINDOW, 10);
	const charts = ranking.length === 0 ? {} : await getHashtagCharts(deps.redis, ranking, 20);

	return ranking.map((tag) => {
		const chart = charts[tag];
		if (chart == null) throw new Error(`Hashtag chart is missing for ${tag}`);

		return {
			tag,
			chart,
			usersCount: Math.max(...chart),
		};
	});
}

export async function handleHonoApiHashtagsList(
	deps: HonoApiHashtagDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'Hashtag'>[]> {
	const params = parseHonoApiParams(hashtagsListParamDef, body);
	const tags = await listHashtagsFromDatabase(deps.db, {
		limit: params.limit,
		attachedToUserOnly: params.attachedToUserOnly,
		attachedToLocalUserOnly: params.attachedToLocalUserOnly,
		attachedToRemoteUserOnly: params.attachedToRemoteUserOnly,
		sort: params.sort as HashtagSort,
	});

	return tags.map(packHonoApiHashtag);
}

export async function handleHonoApiHashtagsSearch(
	deps: HonoApiHashtagDependencies,
	body: Record<string, unknown>,
): Promise<string[]> {
	const params = parseHonoApiParams(hashtagsSearchParamDef, body);
	return await searchHashtagNamesFromDatabase(deps.db, {
		query: params.query,
		limit: params.limit,
		offset: params.offset,
	});
}

export async function handleHonoApiHashtagsShow(
	deps: HonoApiHashtagDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'Hashtag'>> {
	const params = parseHonoApiParams(hashtagsShowParamDef, body);
	const hashtag = await fetchHashtagByNameFromDatabase(deps.db, normalizeForSearch(params.tag));
	if (hashtag == null) throw noSuchHashtagError();

	return packHonoApiHashtag(hashtag);
}

export const hashtagsUsersParamDef = z.object({
	tag: z.string(),
	limit: z.number().int().min(1).max(100).optional().default(10),
	offset: z.number().int().optional().default(0),
	sort: z.enum(['+follower', '-follower', '+createdAt', '-createdAt', '+updatedAt', '-updatedAt']),
	state: z.enum(['all', 'alive']).optional().default('all'),
	origin: z.enum(['combined', 'local', 'remote']).optional().default('local'),
});

type HashtagsUsersParams = {
	tag: string;
	limit: number;
	offset: number;
	sort: UserListSort;
	state: UserListState;
	origin: UserListOrigin;
};

export async function handleHonoApiHashtagsUsers(
	deps: HonoApiHashtagDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<(MeDetailedHonoApiResponse | UserDetailedNotMeHonoApiResponse)[]> {
	const params = parseHonoApiParams(hashtagsUsersParamDef, body);

	const tag = normalizeForSearch(params.tag);
	if (!safeForSql(tag)) throw new Error('Injection');

	const users = await listUsersByTagFromDatabase(deps.db, {
		tag,
		limit: params.limit,
		offset: params.offset,
		sort: params.sort,
		state: params.state,
		origin: params.origin,
	});

	return await packUserDetailedManyForHonoApi(deps, users, me);
}
