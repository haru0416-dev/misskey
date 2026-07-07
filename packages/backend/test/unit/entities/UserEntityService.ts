/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ModuleRef } from '@nestjs/core';
import type * as Redis from 'ioredis';
import { describe, expect, beforeAll, afterAll, test } from 'vitest';
import type { MiUser } from '@/models/User.js';
import type { MiMeta } from '@/models/Meta.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { RoleService } from '@/core/RoleService.js';
import { ApPersonService } from '@/core/activitypub/models/ApPersonService.js';
import type { CacheService } from '@/core/CacheService.js';
import type { ApLoggerService } from '@/core/activitypub/ApLoggerService.js';
import { CustomEmojiService } from '@/core/CustomEmojiService.js';
import { AnnouncementService } from '@/core/AnnouncementService.js';
import { IdService } from '@/core/IdService.js';
import { ChatService } from '@/core/ChatService.js';
import { MemoryKVCache } from '@/misc/cache.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import { genAidx } from '@/misc/id/aidx.js';
import { upsertUserMemoInDatabase } from '@/core/UserMemoStore.js';
import type { MiDrizzleDatabase, MiDrizzlePool } from '@/drizzle.js';
import { createDrizzleDatabase, createDrizzlePool } from '@/drizzle.js';
import { loadConfig } from '@/config.js';
import { createRedisClient } from '@/runtime-dependencies.js';
import type { UserInsert } from '@/db/schema/user.js';
import type { UserProfileInsert } from '@/db/schema/user-profile.js';
import { createUserInDatabase } from '@/core/UserStore.js';
import { createUserProfileInDatabase } from '@/core/UserProfileStore.js';
import { createFollowingInDatabase } from '@/core/FollowingStore.js';
import { createBlockingInDatabase } from '@/core/BlockingStore.js';
import { createMutingInDatabase } from '@/core/MutingStore.js';
import { renoteMuting } from '@/db/schema/renote-muting.js';
import { followRequest } from '@/db/schema/follow-request.js';

process.env.NODE_ENV = 'test';

describe('UserEntityService', () => {
	describe('pack/packMany', () => {
		let service: UserEntityService;
		let drizzle: MiDrizzleDatabase;
		let pool: MiDrizzlePool;
		let redisClient: Redis.Redis;

		async function createUser(userData: Partial<UserInsert> = {}, profileData: Partial<UserProfileInsert> = {}) {
			const un = secureRndstr(16);
			const user = await createUserInDatabase(drizzle, {
				...userData,
				id: genAidx(Date.now()),
				username: un,
				usernameLower: un.toLowerCase(),
			});

			await createUserProfileInDatabase(drizzle, {
				...profileData,
				userId: user.id,
			});

			return user;
		}

		async function memo(writer: MiUser, target: MiUser, memo: string) {
			await upsertUserMemoInDatabase(drizzle, {
				id: genAidx(Date.now()),
				userId: writer.id,
				targetUserId: target.id,
				memo,
			});
		}

		async function follow(follower: MiUser, followee: MiUser) {
			await createFollowingInDatabase(drizzle, {
				id: genAidx(Date.now()),
				followerId: follower.id,
				followeeId: followee.id,
			});
		}

		async function requestFollow(requester: MiUser, requestee: MiUser) {
			await drizzle.insert(followRequest).values({
				id: genAidx(Date.now()),
				followerId: requester.id,
				followeeId: requestee.id,
			});
		}

		async function block(blocker: MiUser, blockee: MiUser) {
			await createBlockingInDatabase(drizzle, {
				id: genAidx(Date.now()),
				blockerId: blocker.id,
				blockeeId: blockee.id,
			});
		}

		async function mute(mutant: MiUser, mutee: MiUser) {
			await createMutingInDatabase(drizzle, {
				id: genAidx(Date.now()),
				muterId: mutant.id,
				muteeId: mutee.id,
			});
		}

		async function muteRenote(mutant: MiUser, mutee: MiUser) {
			await drizzle.insert(renoteMuting).values({
				id: genAidx(Date.now()),
				muterId: mutant.id,
				muteeId: mutee.id,
			});
		}

		function randomIntRange(weight = 10) {
			return [...Array(Math.floor(Math.random() * weight))].map((it, idx) => idx);
		}

		beforeAll(async () => {
			const config = loadConfig();
			pool = createDrizzlePool(config);
			drizzle = createDrizzleDatabase(pool, config);
			redisClient = createRedisClient(config);
			const meta = {} as MiMeta;

			// unused: placeholder for constructor params never touched by any call
			// path exercised in this file's tests (mirrors DriveService.ts/NoteCreateService.ts).
			const unused = undefined as never;

			// UserEntityService's own moduleRef is populated with real collaborators
			// (or `unused`) further down, AFTER those collaborators are constructed.
			// This breaks the RoleService <-> UserEntityService cycle: RoleService takes
			// UserEntityService via real constructor injection, while UserEntityService
			// only looks up RoleService lazily via moduleRef.get(...) inside its own
			// onModuleInit(), exactly mirroring Nest's own lifecycle ordering.
			const userModuleRefMap: Record<string, unknown> = {};
			const userModuleRef = { get: (token: string) => userModuleRefMap[token] } as unknown as ModuleRef;

			service = new UserEntityService(userModuleRef, config, meta, redisClient, drizzle);

			// idService: real, cheap (only needs config). Used directly by pack() for
			// createdAt/announcement createdAt, and by RoleService (unused code path here).
			const idService = new IdService(config);

			// roleService: real. Every exercised method (isModerator/isAdministrator/
			// getUserBadgeRoles/getUserPolicies/getUserRoles) only touches this.db/
			// this.meta/this.config plus its own in-memory caches — no conditional
			// roles exist in these tests, so cacheService.findUserById is never reached.
			const roleModuleRef = { get: () => unused } as unknown as ModuleRef;
			const redisForSub = { on: () => {}, off: () => {} } as unknown as Redis.Redis;
			const roleService = new RoleService(
				roleModuleRef,
				config,
				meta,
				unused, // redisForTimelines: never touched by any exercised method
				redisForSub,
				drizzle,
				unused, // cacheService: unused (no conditional roles created in these tests)
				service, // real UserEntityService instance (constructor-injected, not via moduleRef)
				unused, // globalEventService
				idService,
				unused, // moderationLogService
				unused, // fanoutTimelineService
			);
			await roleService.onModuleInit();

			// apPersonService: real. Only fetchPerson() is exercised (via the
			// "alsoKnownAs as string" test), which touches only
			// this.cacheService.uriPersonCache, this.config, and this.drizzle.
			// Every other onModuleInit-populated field is dead weight here, EXCEPT
			// apLoggerService: onModuleInit() unconditionally does
			// `this.logger = this.apLoggerService.logger`, so that token must resolve
			// to something with a `.logger` property or construction throws.
			const apPersonModuleRefMap: Record<string, unknown> = {
				CacheService: { uriPersonCache: new MemoryKVCache<MiUser | null>(Infinity) } as unknown as CacheService,
				ApLoggerService: { logger: { warn: () => {} } } as unknown as ApLoggerService,
			};
			const apPersonModuleRef = { get: (token: string) => apPersonModuleRefMap[token] ?? unused } as unknown as ModuleRef;
			const apPersonService = new ApPersonService(apPersonModuleRef, config, meta, drizzle, roleService);
			apPersonService.onModuleInit();

			// noteEntityService: real, but pinnedNotes is always packMany([]) in these
			// tests (no test ever pins a note) — packMany() returns before touching
			// this.meta/this.db, so all 3 ctor params can stay unset.
			const noteEntityService = new NoteEntityService(unused, unused, unused);

			// customEmojiService: real. populateEmojis() is called unconditionally by
			// pack(), but every test user has an empty emojis array, so populateEmojis
			// short-circuits (Promise.all([])) before touching any of its 7 ctor params.
			const customEmojiService = new CustomEmojiService(unused, unused, unused, unused, unused, unused, unused);

			// announcementService: real. Only getUnreadAnnouncements() is exercised
			// (in the MeDetailed test), which only touches this.drizzle.
			const announcementService = new AnnouncementService(drizzle, unused, unused, unused, unused);

			// chatService: real. Only hasUnreadMessages() is exercised (MeDetailed
			// test), which only touches this.redisClient (via SCARD).
			const chatService = new ChatService(
				config, redisClient, unused, unused, unused, unused, unused,
				unused, unused, unused, unused, unused, unused, unused, unused, unused,
			);

			Object.assign(userModuleRefMap, {
				ApPersonService: apPersonService,
				NoteEntityService: noteEntityService,
				PageEntityService: unused, // never invoked: no test sets profile.pinnedPageId
				CustomEmojiService: customEmojiService,
				AnnouncementService: announcementService,
				RoleService: roleService,
				FederatedInstanceService: unused, // never invoked: every test user has host === null
				IdService: idService,
				AvatarDecorationService: unused, // never invoked: every test user has avatarDecorations === []
				ChatService: chatService,
			});
			service.onModuleInit();
		});

		afterAll(async () => {
			await redisClient.quit();
			await pool.end();
		});

		test('UserLite', async() => {
			const me = await createUser();
			const who = await createUser();

			await memo(me, who, 'memo');

			const actual = await service.pack(who, me, { schema: 'UserLite' }) as any;
			// no detail
			expect(actual.memo).toBeUndefined();
			// no detail and me
			expect(actual.birthday).toBeUndefined();
			// no detail and me
			expect(actual.achievements).toBeUndefined();
		});

		test('UserDetailedNotMe', async() => {
			const me = await createUser();
			const who = await createUser({}, { birthday: '2000-01-01' });

			await memo(me, who, 'memo');

			const actual = await service.pack(who, me, { schema: 'UserDetailedNotMe' }) as any;
			// is detail
			expect(actual.memo).toBe('memo');
			// is detail
			expect(actual.birthday).toBe('2000-01-01');
			// no detail and me
			expect(actual.achievements).toBeUndefined();
		});

		test('MeDetailed', async() => {
			const achievements = [{ name: 'iLoveMisskey' as const, unlockedAt: new Date().getTime() }];
			const me = await createUser({}, {
				birthday: '2000-01-01',
				achievements: achievements,
			});
			await memo(me, me, 'memo');

			const actual = await service.pack(me, me, { schema: 'MeDetailed' }) as any;
			// is detail
			expect(actual.memo).toBe('memo');
			// is detail
			expect(actual.birthday).toBe('2000-01-01');
			// is detail and me
			expect(actual.achievements).toEqual(achievements);
		});

		test('alsoKnownAs as string does not throw', async () => {
			const me = await createUser();
			const who = await createUser();

			const whoWithStringAlsoKnownAs: MiUser = { ...who, alsoKnownAs: 'https://remote.example.com/users/alice' as any };

			const actual = await service.pack(whoWithStringAlsoKnownAs, me, { schema: 'UserDetailedNotMe' }) as any;
			expect(Array.isArray(actual.alsoKnownAs)).toBe(true);
		});

		describe('packManyによるpreloadがある時、preloadが無い時とpackの結果が同じになるか見たい', () => {
			test('no-preload', async() => {
				const me = await createUser();
				// meがフォローしてる人たち
				const followeeMe = await Promise.all(randomIntRange().map(() => createUser()));
				for (const who of followeeMe) {
					await follow(me, who);
					const actual = await service.pack(who, me, { schema: 'UserDetailed' }) as any;
					expect(actual.isFollowing).toBe(true);
					expect(actual.isFollowed).toBe(false);
					expect(actual.hasPendingFollowRequestFromYou).toBe(false);
					expect(actual.hasPendingFollowRequestToYou).toBe(false);
					expect(actual.isBlocking).toBe(false);
					expect(actual.isBlocked).toBe(false);
					expect(actual.isMuted).toBe(false);
					expect(actual.isRenoteMuted).toBe(false);
				}

				// meをフォローしてる人たち
				const followerMe = await Promise.all(randomIntRange().map(() => createUser()));
				for (const who of followerMe) {
					await follow(who, me);
					const actual = await service.pack(who, me, { schema: 'UserDetailed' }) as any;
					expect(actual.isFollowing).toBe(false);
					expect(actual.isFollowed).toBe(true);
					expect(actual.hasPendingFollowRequestFromYou).toBe(false);
					expect(actual.hasPendingFollowRequestToYou).toBe(false);
					expect(actual.isBlocking).toBe(false);
					expect(actual.isBlocked).toBe(false);
					expect(actual.isMuted).toBe(false);
					expect(actual.isRenoteMuted).toBe(false);
				}

				// meがフォローリクエストを送った人たち
				const requestsFromYou = await Promise.all(randomIntRange().map(() => createUser()));
				for (const who of requestsFromYou) {
					await requestFollow(me, who);
					const actual = await service.pack(who, me, { schema: 'UserDetailed' }) as any;
					expect(actual.isFollowing).toBe(false);
					expect(actual.isFollowed).toBe(false);
					expect(actual.hasPendingFollowRequestFromYou).toBe(true);
					expect(actual.hasPendingFollowRequestToYou).toBe(false);
					expect(actual.isBlocking).toBe(false);
					expect(actual.isBlocked).toBe(false);
					expect(actual.isMuted).toBe(false);
					expect(actual.isRenoteMuted).toBe(false);
				}

				// meにフォローリクエストを送った人たち
				const requestsToYou = await Promise.all(randomIntRange().map(() => createUser()));
				for (const who of requestsToYou) {
					await requestFollow(who, me);
					const actual = await service.pack(who, me, { schema: 'UserDetailed' }) as any;
					expect(actual.isFollowing).toBe(false);
					expect(actual.isFollowed).toBe(false);
					expect(actual.hasPendingFollowRequestFromYou).toBe(false);
					expect(actual.hasPendingFollowRequestToYou).toBe(true);
					expect(actual.isBlocking).toBe(false);
					expect(actual.isBlocked).toBe(false);
					expect(actual.isMuted).toBe(false);
					expect(actual.isRenoteMuted).toBe(false);
				}

				// meがブロックしてる人たち
				const blockingYou = await Promise.all(randomIntRange().map(() => createUser()));
				for (const who of blockingYou) {
					await block(me, who);
					const actual = await service.pack(who, me, { schema: 'UserDetailed' }) as any;
					expect(actual.isFollowing).toBe(false);
					expect(actual.isFollowed).toBe(false);
					expect(actual.hasPendingFollowRequestFromYou).toBe(false);
					expect(actual.hasPendingFollowRequestToYou).toBe(false);
					expect(actual.isBlocking).toBe(true);
					expect(actual.isBlocked).toBe(false);
					expect(actual.isMuted).toBe(false);
					expect(actual.isRenoteMuted).toBe(false);
				}

				// meをブロックしてる人たち
				const blockingMe = await Promise.all(randomIntRange().map(() => createUser()));
				for (const who of blockingMe) {
					await block(who, me);
					const actual = await service.pack(who, me, { schema: 'UserDetailed' }) as any;
					expect(actual.isFollowing).toBe(false);
					expect(actual.isFollowed).toBe(false);
					expect(actual.hasPendingFollowRequestFromYou).toBe(false);
					expect(actual.hasPendingFollowRequestToYou).toBe(false);
					expect(actual.isBlocking).toBe(false);
					expect(actual.isBlocked).toBe(true);
					expect(actual.isMuted).toBe(false);
					expect(actual.isRenoteMuted).toBe(false);
				}

				// meがミュートしてる人たち
				const muters = await Promise.all(randomIntRange().map(() => createUser()));
				for (const who of muters) {
					await mute(me, who);
					const actual = await service.pack(who, me, { schema: 'UserDetailed' }) as any;
					expect(actual.isFollowing).toBe(false);
					expect(actual.isFollowed).toBe(false);
					expect(actual.hasPendingFollowRequestFromYou).toBe(false);
					expect(actual.hasPendingFollowRequestToYou).toBe(false);
					expect(actual.isBlocking).toBe(false);
					expect(actual.isBlocked).toBe(false);
					expect(actual.isMuted).toBe(true);
					expect(actual.isRenoteMuted).toBe(false);
				}

				// meがリノートミュートしてる人たち
				const renoteMuters = await Promise.all(randomIntRange().map(() => createUser()));
				for (const who of renoteMuters) {
					await muteRenote(me, who);
					const actual = await service.pack(who, me, { schema: 'UserDetailed' }) as any;
					expect(actual.isFollowing).toBe(false);
					expect(actual.isFollowed).toBe(false);
					expect(actual.hasPendingFollowRequestFromYou).toBe(false);
					expect(actual.hasPendingFollowRequestToYou).toBe(false);
					expect(actual.isBlocking).toBe(false);
					expect(actual.isBlocked).toBe(false);
					expect(actual.isMuted).toBe(false);
					expect(actual.isRenoteMuted).toBe(true);
				}
			});

			test('preload', async() => {
				const me = await createUser();

				{
					// meがフォローしてる人たち
					const followeeMe = await Promise.all(randomIntRange().map(() => createUser()));
					for (const who of followeeMe) {
						await follow(me, who);
					}
					const actualList = await service.packMany(followeeMe, me, { schema: 'UserDetailed' }) as any;
					for (const actual of actualList) {
						expect(actual.isFollowing).toBe(true);
						expect(actual.isFollowed).toBe(false);
						expect(actual.hasPendingFollowRequestFromYou).toBe(false);
						expect(actual.hasPendingFollowRequestToYou).toBe(false);
						expect(actual.isBlocking).toBe(false);
						expect(actual.isBlocked).toBe(false);
						expect(actual.isMuted).toBe(false);
						expect(actual.isRenoteMuted).toBe(false);
					}
				}

				{
					// meをフォローしてる人たち
					const followerMe = await Promise.all(randomIntRange().map(() => createUser()));
					for (const who of followerMe) {
						await follow(who, me);
					}
					const actualList = await service.packMany(followerMe, me, { schema: 'UserDetailed' }) as any;
					for (const actual of actualList) {
						expect(actual.isFollowing).toBe(false);
						expect(actual.isFollowed).toBe(true);
						expect(actual.hasPendingFollowRequestFromYou).toBe(false);
						expect(actual.hasPendingFollowRequestToYou).toBe(false);
						expect(actual.isBlocking).toBe(false);
						expect(actual.isBlocked).toBe(false);
						expect(actual.isMuted).toBe(false);
						expect(actual.isRenoteMuted).toBe(false);
					}
				}

				{
					// meがフォローリクエストを送った人たち
					const requestsFromYou = await Promise.all(randomIntRange().map(() => createUser()));
					for (const who of requestsFromYou) {
						await requestFollow(me, who);
					}
					const actualList = await service.packMany(requestsFromYou, me, { schema: 'UserDetailed' }) as any;
					for (const actual of actualList) {
						expect(actual.isFollowing).toBe(false);
						expect(actual.isFollowed).toBe(false);
						expect(actual.hasPendingFollowRequestFromYou).toBe(true);
						expect(actual.hasPendingFollowRequestToYou).toBe(false);
						expect(actual.isBlocking).toBe(false);
						expect(actual.isBlocked).toBe(false);
						expect(actual.isMuted).toBe(false);
						expect(actual.isRenoteMuted).toBe(false);
					}
				}

				{
					// meにフォローリクエストを送った人たち
					const requestsToYou = await Promise.all(randomIntRange().map(() => createUser()));
					for (const who of requestsToYou) {
						await requestFollow(who, me);
					}
					const actualList = await service.packMany(requestsToYou, me, { schema: 'UserDetailed' }) as any;
					for (const actual of actualList) {
						expect(actual.isFollowing).toBe(false);
						expect(actual.isFollowed).toBe(false);
						expect(actual.hasPendingFollowRequestFromYou).toBe(false);
						expect(actual.hasPendingFollowRequestToYou).toBe(true);
						expect(actual.isBlocking).toBe(false);
						expect(actual.isBlocked).toBe(false);
						expect(actual.isMuted).toBe(false);
						expect(actual.isRenoteMuted).toBe(false);
					}
				}

				{
					// meがブロックしてる人たち
					const blockingYou = await Promise.all(randomIntRange().map(() => createUser()));
					for (const who of blockingYou) {
						await block(me, who);
					}
					const actualList = await service.packMany(blockingYou, me, { schema: 'UserDetailed' }) as any;
					for (const actual of actualList) {
						expect(actual.isFollowing).toBe(false);
						expect(actual.isFollowed).toBe(false);
						expect(actual.hasPendingFollowRequestFromYou).toBe(false);
						expect(actual.hasPendingFollowRequestToYou).toBe(false);
						expect(actual.isBlocking).toBe(true);
						expect(actual.isBlocked).toBe(false);
						expect(actual.isMuted).toBe(false);
						expect(actual.isRenoteMuted).toBe(false);
					}
				}

				{
					// meをブロックしてる人たち
					const blockingMe = await Promise.all(randomIntRange().map(() => createUser()));
					for (const who of blockingMe) {
						await block(who, me);
					}
					const actualList = await service.packMany(blockingMe, me, { schema: 'UserDetailed' }) as any;
					for (const actual of actualList) {
						expect(actual.isFollowing).toBe(false);
						expect(actual.isFollowed).toBe(false);
						expect(actual.hasPendingFollowRequestFromYou).toBe(false);
						expect(actual.hasPendingFollowRequestToYou).toBe(false);
						expect(actual.isBlocking).toBe(false);
						expect(actual.isBlocked).toBe(true);
						expect(actual.isMuted).toBe(false);
						expect(actual.isRenoteMuted).toBe(false);
					}
				}

				{
					// meがミュートしてる人たち
					const muters = await Promise.all(randomIntRange().map(() => createUser()));
					for (const who of muters) {
						await mute(me, who);
					}
					const actualList = await service.packMany(muters, me, { schema: 'UserDetailed' }) as any;
					for (const actual of actualList) {
						expect(actual.isFollowing).toBe(false);
						expect(actual.isFollowed).toBe(false);
						expect(actual.hasPendingFollowRequestFromYou).toBe(false);
						expect(actual.hasPendingFollowRequestToYou).toBe(false);
						expect(actual.isBlocking).toBe(false);
						expect(actual.isBlocked).toBe(false);
						expect(actual.isMuted).toBe(true);
						expect(actual.isRenoteMuted).toBe(false);
					}
				}

				{
					// meがリノートミュートしてる人たち
					const renoteMuters = await Promise.all(randomIntRange().map(() => createUser()));
					for (const who of renoteMuters) {
						await muteRenote(me, who);
					}
					const actualList = await service.packMany(renoteMuters, me, { schema: 'UserDetailed' }) as any;
					for (const actual of actualList) {
						expect(actual.isFollowing).toBe(false);
						expect(actual.isFollowed).toBe(false);
						expect(actual.hasPendingFollowRequestFromYou).toBe(false);
						expect(actual.hasPendingFollowRequestToYou).toBe(false);
						expect(actual.isBlocking).toBe(false);
						expect(actual.isBlocked).toBe(false);
						expect(actual.isMuted).toBe(false);
						expect(actual.isRenoteMuted).toBe(true);
					}
				}
			});
		});
	});
});
