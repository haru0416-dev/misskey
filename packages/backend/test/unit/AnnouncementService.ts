/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, expect, beforeEach, afterEach, test, vi } from 'vitest';
import type { Mocked } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { Test } from '@nestjs/testing';
import { GlobalModule } from '@/GlobalModule.js';
import { AnnouncementService } from '@/core/AnnouncementService.js';
import { AnnouncementEntityService } from '@/core/entities/AnnouncementEntityService.js';
import { createAnnouncementInDatabase, fetchAnnouncementByIdOrFailFromDatabase } from '@/core/AnnouncementStore.js';
import type {
	MiAnnouncement,
	MiUser,
	UsersRepository,
} from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { announcement, type AnnouncementInsert } from '@/db/schema/announcement.js';
import { announcementRead } from '@/db/schema/announcement-read.js';
import { meta as metaTable } from '@/db/schema/meta.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genAidx } from '@/misc/id/aidx.js';
import { CacheService } from '@/core/CacheService.js';
import { IdService } from '@/core/IdService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import type { TestingModule } from '@nestjs/testing';

describe('AnnouncementService', () => {
	let app: TestingModule;
	let announcementService: AnnouncementService;
	let usersRepository: UsersRepository;
	let drizzle: MiDrizzleDatabase;
	let globalEventService: Mocked<GlobalEventService>;
	let moderationLogService: Mocked<ModerationLogService>;

	function createUser(data: Partial<MiUser> = {}) {
		const un = secureRndstr(16);
		return usersRepository.insert({
			id: genAidx(Date.now()),
			username: un,
			usernameLower: un.toLowerCase(),
			...data,
		})
			.then(x => usersRepository.findOneByOrFail(x.identifiers[0]));
	}

	function createAnnouncement(data: Partial<MiAnnouncement & { createdAt: Date }> = {}) {
		const { createdAt, ...rest } = data;

		return createAnnouncementInDatabase(drizzle, {
			id: genAidx(createdAt?.getTime() ?? Date.now()),
			updatedAt: null,
			title: 'Title',
			text: 'Text',
			...rest,
		} as AnnouncementInsert);
	}

	beforeEach(async () => {
		app = await Test.createTestingModule({
			imports: [
				GlobalModule,
			],
			providers: [
				AnnouncementService,
				AnnouncementEntityService,
				CacheService,
				IdService,
			],
		})
			.useMocker((token) => {
				if (token === GlobalEventService) {
					return {
						publishMainStream: vi.fn(),
						publishBroadcastStream: vi.fn(),
					};
				} else if (token === ModerationLogService) {
					return {
						log: vi.fn(),
					};
				} else if (typeof token === 'function') {
					return mockDeep<typeof token>();
				}
			})
			.compile();

		app.enableShutdownHooks();

		announcementService = app.get<AnnouncementService>(AnnouncementService);
		usersRepository = app.get<UsersRepository>(DI.usersRepository);
		drizzle = app.get<MiDrizzleDatabase>(DI.drizzle);
		globalEventService = app.get<GlobalEventService>(GlobalEventService) as Mocked<GlobalEventService>;
		moderationLogService = app.get<ModerationLogService>(ModerationLogService) as Mocked<ModerationLogService>;
	});

	afterEach(async () => {
		await Promise.all([
			drizzle.delete(metaTable),
			drizzle.delete(announcementRead),
			drizzle.delete(announcement),
			usersRepository.createQueryBuilder().delete().execute(),
		]);

		await app.close();
	});

	describe('getUnreadAnnouncements', () => {
		test('通常', async () => {
			const user = await createUser();
			const announcement = await createAnnouncement({
				title: '1',
			});

			const result = await announcementService.getUnreadAnnouncements(user);

			expect(result.length).toBe(1);
			expect(result[0].title).toBe(announcement.title);
		});

		test('isActiveがfalseは除外', async () => {
			const user = await createUser();
			await createAnnouncement({
				isActive: false,
			});

			const result = await announcementService.getUnreadAnnouncements(user);

			expect(result.length).toBe(0);
		});

		test('forExistingUsers', async () => {
			const user = await createUser();
			const [announcementAfter, announcementBefore, announcementBefore2] = await Promise.all([
				createAnnouncement({
					title: 'after',
					createdAt: new Date(),
					forExistingUsers: true,
				}),
				createAnnouncement({
					title: 'before',
					createdAt: new Date(Date.now() - 1000),
					forExistingUsers: true,
				}),
				createAnnouncement({
					title: 'before2',
					createdAt: new Date(Date.now() - 1000),
					forExistingUsers: false,
				}),
			]);

			const result = await announcementService.getUnreadAnnouncements(user);

			expect(result.length).toBe(2);
			expect(result.some(a => a.title === announcementAfter.title)).toBe(true);
			expect(result.some(a => a.title === announcementBefore.title)).toBe(false);
			expect(result.some(a => a.title === announcementBefore2.title)).toBe(true);
		});
	});

	describe('create', () => {
		test('通常', async () => {
			const me = await createUser();
			const result = await announcementService.create({
				title: 'Title',
				text: 'Text',
			}, me);

			expect(result.raw.title).toBe('Title');
			expect(result.packed.title).toBe('Title');

			expect(globalEventService.publishBroadcastStream).toHaveBeenCalled();
			expect(globalEventService.publishBroadcastStream.mock.lastCall![0]).toBe('announcementCreated');
			expect((globalEventService.publishBroadcastStream.mock.lastCall![1] as any).announcement).toBe(result.packed);
			expect(moderationLogService.log).toHaveBeenCalled();
		});

		test('ユーザー指定', async () => {
			const me = await createUser();
			const user = await createUser();
			const result = await announcementService.create({
				title: 'Title',
				text: 'Text',
				userId: user.id,
			}, me);

			expect(result.raw.title).toBe('Title');
			expect(result.packed.title).toBe('Title');

			expect(globalEventService.publishBroadcastStream).not.toHaveBeenCalled();
			expect(globalEventService.publishMainStream).toHaveBeenCalled();
			expect(globalEventService.publishMainStream.mock.lastCall![0]).toBe(user.id);
			expect(globalEventService.publishMainStream.mock.lastCall![1]).toBe('announcementCreated');
			expect((globalEventService.publishMainStream.mock.lastCall![2] as any).announcement).toBe(result.packed);
			expect(moderationLogService.log).toHaveBeenCalled();
		});
	});

	describe('read', () => {
		test('既読を作成する', async () => {
			const user = await createUser();
			const announcement = await createAnnouncement();

			await announcementService.read(user, announcement.id);

			const reads = await announcementService.getReads(user.id);
			expect(reads).toHaveLength(1);
			expect(reads[0].announcementId).toBe(announcement.id);
		});

		test('重複既読は無視する', async () => {
			const user = await createUser();
			const announcement = await createAnnouncement();

			await announcementService.read(user, announcement.id);
			await announcementService.read(user, announcement.id);

			const reads = await announcementService.getReads(user.id);
			expect(reads).toHaveLength(1);
		});

		test('ユーザー指定お知らせは既読時に非アクティブ化する', async () => {
			const user = await createUser();
			const announcement = await createAnnouncement({
				userId: user.id,
			});

			await announcementService.read(user, announcement.id);

			const result = await fetchAnnouncementByIdOrFailFromDatabase(drizzle, announcement.id);
			expect(result.isActive).toBe(false);
		});
	});
});
