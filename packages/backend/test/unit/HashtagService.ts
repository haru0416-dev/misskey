/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { GlobalModule } from '@/GlobalModule.js';
import { HashtagService } from '@/core/HashtagService.js';
import { FeaturedService } from '@/core/FeaturedService.js';
import { IdService } from '@/core/IdService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { DI } from '@/di-symbols.js';
import { hashtag } from '@/db/schema/hashtag.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genAidx } from '@/misc/id/aidx.js';
import type { TestingModule } from '@nestjs/testing';

describe('HashtagService', () => {
	let app: TestingModule;
	let db: MiDrizzleDatabase;
	let hashtagService: HashtagService;

	beforeEach(async () => {
		const pipeline = {
			pfadd: vi.fn().mockReturnThis(),
			expire: vi.fn().mockReturnThis(),
			sadd: vi.fn().mockReturnThis(),
			exec: vi.fn().mockResolvedValue([]),
		};

		app = await Test.createTestingModule({
			imports: [
				GlobalModule,
			],
			providers: [
				HashtagService,
				IdService,
				{
					provide: DI.meta,
					useValue: {
						hiddenTags: [],
						sensitiveWords: [],
					},
				},
				{
					provide: DI.redis,
					useValue: {
						sismember: vi.fn().mockResolvedValue(0),
						pipeline: vi.fn(() => pipeline),
					},
				},
				{
					provide: UserEntityService,
					useValue: {
						isLocalUser: (user: { host: string | null }) => user.host == null,
						isRemoteUser: (user: { host: string | null }) => user.host != null,
					},
				},
				{
					provide: FeaturedService,
					useValue: {
						updateHashtagsRanking: vi.fn(),
					},
				},
				{
					provide: UtilityService,
					useValue: {
						isKeyWordIncluded: vi.fn(() => false),
					},
				},
			],
		}).compile();

		app.enableShutdownHooks();

		db = app.get<MiDrizzleDatabase>(DI.drizzle);
		hashtagService = app.get<HashtagService>(HashtagService);
	});

	afterEach(async () => {
		await db.delete(hashtag);
		await app.close();
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
