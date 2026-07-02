/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const DI = {
	config: Symbol('config'),
	drizzle: Symbol('drizzle'),
	drizzlePool: Symbol('drizzlePool'),
	meta: Symbol('meta'),
	meilisearch: Symbol('meilisearch'),
	redis: Symbol('redis'),
	redisForPub: Symbol('redisForPub'),
	redisForSub: Symbol('redisForSub'),
	redisForTimelines: Symbol('redisForTimelines'),
	redisForReactions: Symbol('redisForReactions'),
};
