/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable */

import { afterEach, beforeEach, describe, expect, beforeAll, afterAll, test } from 'vitest';
import type * as Redis from 'ioredis';
import { loadConfig } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool } from '@/drizzle.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { IdService } from '@/core/IdService.js';
import type { MiChannel } from '@/models/Channel.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiUser } from '@/models/User.js';
import { ChannelFollowingService } from "@/core/ChannelFollowingService.js";
import type { MiLocalUser } from "@/models/User.js";
import type { MiDrizzleDatabase, MiDrizzlePool } from '@/drizzle.js';
import { channelFollowing, type ChannelFollowingRow } from '@/db/schema/channel-following.js';
import { channel, type ChannelInsert } from '@/db/schema/channel.js';
import { driveFile, type DriveFileInsert } from '@/db/schema/drive-file.js';
import { user, type UserInsert } from '@/db/schema/user.js';
import { userProfile } from '@/db/schema/user-profile.js';
import { createChannelInDatabase } from '@/core/ChannelStore.js';
import { createDriveFileInDatabase } from '@/core/DriveFileStore.js';
import { createUserInDatabase } from '@/core/UserStore.js';
import { createUserProfileInDatabase } from '@/core/UserProfileStore.js';

describe('ChannelFollowingService', () => {
	let pool: MiDrizzlePool;
	let service: ChannelFollowingService;
	let drizzle: MiDrizzleDatabase;
	let idService: IdService;

	let alice: MiLocalUser;
	let bob: MiLocalUser;
	let channel1: MiChannel;
	let channel2: MiChannel;
	let channel3: MiChannel;
	let driveFile1: MiDriveFile;
	let driveFile2: MiDriveFile;

	async function createUser(data: Partial<UserInsert> = {}) {
		const user = await createUserInDatabase(drizzle, {
			id: idService.gen(),
			username: 'username',
			usernameLower: 'username',
			...data,
		});

		await createUserProfileInDatabase(drizzle, {
			userId: user.id,
		});

		return user;
	}

	async function createChannel(data: Partial<ChannelInsert> = {}) {
		return await createChannelInDatabase(drizzle, {
			id: idService.gen(),
			name: 'channel',
			...data,
		});
	}

	async function createChannelFollowing(data: Partial<ChannelFollowingRow> = {}) {
		const row = {
			id: idService.gen(),
			...data,
		} as ChannelFollowingRow;
		await drizzle
			.insert(channelFollowing)
			.values(row);

		return row;
	}

	async function fetchChannelFollowing() {
		return await drizzle.select().from(channelFollowing);
	}

	async function createDriveFile(data: Partial<DriveFileInsert> = {}) {
		return await createDriveFileInDatabase(drizzle, {
			id: idService.gen(),
			md5: 'md5',
			name: 'name',
			size: 0,
			type: 'type',
			storedInternal: false,
			url: 'url',
			...data,
		});
	}

	beforeAll(async () => {
		const config = loadConfig();
		pool = createDrizzlePool(config);
		drizzle = createDrizzleDatabase(pool, config);

		idService = new IdService(config);
		const globalEventService = new GlobalEventService(config, { publish: () => {} } as unknown as Redis.Redis);

		const redisClient = { on: () => {}, off: () => {} } as unknown as Redis.Redis;
		const redisForSub = { on: () => {}, off: () => {} } as unknown as Redis.Redis;
		service = new ChannelFollowingService(redisClient, redisForSub, drizzle, idService, globalEventService);
	});

	afterAll(async () => {
		await pool.end();
	});

	beforeEach(async () => {
		alice = { ...await createUser({ username: 'alice' }), host: null, uri: null };
		bob = { ...await createUser({ username: 'bob' }), host: null, uri: null };
		driveFile1 = await createDriveFile();
		driveFile2 = await createDriveFile();
		channel1 = await createChannel({ name: 'channel1', userId: alice.id, bannerId: driveFile1.id });
		channel2 = await createChannel({ name: 'channel2', userId: alice.id, bannerId: driveFile2.id });
		channel3 = await createChannel({ name: 'channel3', userId: alice.id, bannerId: driveFile2.id });
	});

	afterEach(async () => {
		await drizzle.delete(channelFollowing);
		await drizzle.delete(channel);
		await drizzle.delete(driveFile);
		await drizzle.delete(userProfile);
		await drizzle.delete(user);
	});

	describe('list', () => {
		test('default', async () => {
			await createChannelFollowing({ followerId: alice.id, followeeId: channel1.id });
			await createChannelFollowing({ followerId: alice.id, followeeId: channel2.id });
			await createChannelFollowing({ followerId: bob.id, followeeId: channel3.id });

			const followings = await service.list({ requestUserId: alice.id });

			expect(followings).toHaveLength(2);
			expect(followings[0].id).toBe(channel1.id);
			expect(followings[0].userId).toBe(alice.id);
			expect(followings[0].user).toBeFalsy();
			expect(followings[0].bannerId).toBe(driveFile1.id);
			expect(followings[0].banner).toBeFalsy();
			expect(followings[1].id).toBe(channel2.id);
			expect(followings[1].userId).toBe(alice.id);
			expect(followings[1].user).toBeFalsy();
			expect(followings[1].bannerId).toBe(driveFile2.id);
			expect(followings[1].banner).toBeFalsy();
		});

		test('idOnly', async () => {
			await createChannelFollowing({ followerId: alice.id, followeeId: channel1.id });
			await createChannelFollowing({ followerId: alice.id, followeeId: channel2.id });
			await createChannelFollowing({ followerId: bob.id, followeeId: channel3.id });

			const followings = await service.list({ requestUserId: alice.id }, { idOnly: true });

			expect(followings).toHaveLength(2);
			expect(followings[0].id).toBe(channel1.id);
			expect(followings[1].id).toBe(channel2.id);
		});

		test('joinUser', async () => {
			await createChannelFollowing({ followerId: alice.id, followeeId: channel1.id });
			await createChannelFollowing({ followerId: alice.id, followeeId: channel2.id });
			await createChannelFollowing({ followerId: bob.id, followeeId: channel3.id });

			const followings = await service.list({ requestUserId: alice.id }, { joinUser: true });

			expect(followings).toHaveLength(2);
			expect(followings[0].id).toBe(channel1.id);
			expect(followings[0].user).toEqual(alice);
			expect(followings[0].banner).toBeFalsy();
			expect(followings[1].id).toBe(channel2.id);
			expect(followings[1].user).toEqual(alice);
			expect(followings[1].banner).toBeFalsy();
		});

		test('joinBannerFile', async () => {
			await createChannelFollowing({ followerId: alice.id, followeeId: channel1.id });
			await createChannelFollowing({ followerId: alice.id, followeeId: channel2.id });
			await createChannelFollowing({ followerId: bob.id, followeeId: channel3.id });

			const followings = await service.list({ requestUserId: alice.id }, { joinBannerFile: true });

			expect(followings).toHaveLength(2);
			expect(followings[0].id).toBe(channel1.id);
			expect(followings[0].user).toBeFalsy();
			expect(followings[0].banner).toEqual(driveFile1);
			expect(followings[1].id).toBe(channel2.id);
			expect(followings[1].user).toBeFalsy();
			expect(followings[1].banner).toEqual(driveFile2);
		});
	});

	describe('follow', () => {
		test('default', async () => {
			await service.follow(alice, channel1);

			const followings = await fetchChannelFollowing();

			expect(followings).toHaveLength(1);
			expect(followings[0].followeeId).toBe(channel1.id);
			expect(followings[0].followerId).toBe(alice.id);
		});
	});

	describe('unfollow', () => {
		test('default', async () => {
			await createChannelFollowing({ followerId: alice.id, followeeId: channel1.id });

			await service.unfollow(alice, channel1);

			const followings = await fetchChannelFollowing();

			expect(followings).toHaveLength(0);
		});
	});
});
