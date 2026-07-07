/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HashtagService } from '@/core/HashtagService.js';
import { FeaturedService } from '@/core/FeaturedService.js';
import { IdService } from '@/core/IdService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { loadConfig } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool } from '@/drizzle.js';
import { hashtag } from '@/db/schema/hashtag.js';
import type { MiDrizzleDatabase, MiDrizzlePool } from '@/drizzle.js';
import type { MiMeta } from '@/models/Meta.js';
import { genAidx } from '@/misc/id/aidx.js';
import type * as Redis from 'ioredis';

describe('HashtagService', () => {
	let pool: MiDrizzlePool;
	let db: MiDrizzleDatabase;
	let hashtagService: HashtagService;

	beforeEach(() => {
		const config = loadConfig();
		pool = createDrizzlePool(config);
		db = createDrizzleDatabase(pool, config);

		const pipeline = {
			pfadd: vi.fn().mockReturnThis(),
			expire: vi.fn().mockReturnThis(),
			sadd: vi.fn().mockReturnThis(),
			exec: vi.fn().mockResolvedValue([]),
		};

		const meta = { hiddenTags: [], sensitiveWords: [] } as unknown as MiMeta;
		const redisClient = {
			sismember: vi.fn().mockResolvedValue(0),
			pipeline: vi.fn(() => pipeline),
		} as unknown as Redis.Redis;
		const userEntityService = {
			isLocalUser: (user: { host: string | null }) => user.host == null,
			isRemoteUser: (user: { host: string | null }) => user.host != null,
		} as unknown as UserEntityService;
		const featuredService = { updateHashtagsRanking: vi.fn() } as unknown as FeaturedService;
		const idService = new IdService(config);
		const utilityService = { isKeyWordIncluded: vi.fn(() => false) } as unknown as UtilityService;

		hashtagService = new HashtagService(meta, redisClient, db, userEntityService, featuredService, idService, utilityService);
	});

	afterEach(async () => {
		await db.delete(hashtag);
		await pool.end();
	});

	test('mentioned hashtag counts each user once', async () => {
		const user = {
			id: genAidx(Date.now()),
			host: null,
		};

		await hashtagService.updateHashtag(user, 'MissKey');
		await hashtagService.updateHashtag(user, 'MissKey');

		const [row] = await db.select().from(hashtag);

		expect(row.name).toBe('misskey');
		expect(row.mentionedUserIds).toEqual([user.id]);
		expect(row.mentionedUsersCount).toBe(1);
		expect(row.mentionedLocalUserIds).toEqual([user.id]);
		expect(row.mentionedLocalUsersCount).toBe(1);
		expect(row.mentionedRemoteUserIds).toEqual([]);
		expect(row.mentionedRemoteUsersCount).toBe(0);
	});

	test('attached hashtag can be removed without negative counts', async () => {
		const user = {
			id: genAidx(Date.now()),
			host: 'example.com',
		};

		await hashtagService.updateHashtag(user, 'Profile', true, true);
		await hashtagService.updateHashtag(user, 'Profile', true, false);
		await hashtagService.updateHashtag(user, 'Profile', true, false);

		const [row] = await db.select().from(hashtag);

		expect(row.name).toBe('profile');
		expect(row.attachedUserIds).toEqual([]);
		expect(row.attachedUsersCount).toBe(0);
		expect(row.attachedRemoteUserIds).toEqual([]);
		expect(row.attachedRemoteUsersCount).toBe(0);
		expect(row.attachedLocalUserIds).toEqual([]);
		expect(row.attachedLocalUsersCount).toBe(0);
	});
});
