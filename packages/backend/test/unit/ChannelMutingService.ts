/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable */

import { afterEach, beforeEach, describe, expect, beforeAll, afterAll, test } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { GlobalModule } from '@/GlobalModule.js';
import { CoreModule } from '@/core/CoreModule.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { IdService } from '@/core/IdService.js';
import { ChannelMutingService } from '@/core/ChannelMutingService.js';
import type { MiChannel } from '@/models/Channel.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiUser } from '@/models/User.js';
import type { MiChannelMuting } from '@/models/ChannelMuting.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { channelMuting, type ChannelMutingInsert } from '@/db/schema/channel-muting.js';
import { channel, type ChannelInsert } from '@/db/schema/channel.js';
import { driveFile, type DriveFileInsert } from '@/db/schema/drive-file.js';
import { user, type UserInsert } from '@/db/schema/user.js';
import { userProfile } from '@/db/schema/user-profile.js';
import { createChannelMutingInDatabase } from '@/core/ChannelMutingStore.js';
import { createChannelInDatabase } from '@/core/ChannelStore.js';
import { createDriveFileInDatabase } from '@/core/DriveFileStore.js';
import { createUserInDatabase } from '@/core/UserStore.js';
import { createUserProfileInDatabase } from '@/core/UserProfileStore.js';
import { DI } from '@/di-symbols.js';
import { setTimeout } from 'node:timers/promises';

describe('ChannelMutingService', () => {
	let app: TestingModule;
	let service: ChannelMutingService;
	let drizzle: MiDrizzleDatabase;
	let idService: IdService;

	let alice: MiUser;
	let bob: MiUser;
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

	async function createChannelMuting(data: Partial<ChannelMutingInsert> = {}) {
		const muting = {
			id: idService.gen(),
			...data,
		} as ChannelMutingInsert;

		await createChannelMutingInDatabase(drizzle, muting);

		return muting;
	}

	async function fetchChannelMuting() {
		return await drizzle.select().from(channelMuting);
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
		app = await Test.createTestingModule({
			imports: [
				GlobalModule,
				CoreModule,
			],
			providers: [
				GlobalEventService,
				IdService,
				ChannelMutingService,
			],
		}).compile();

		app.enableShutdownHooks();

		service = app.get<ChannelMutingService>(ChannelMutingService);
		idService = app.get<IdService>(IdService);
		drizzle = app.get<MiDrizzleDatabase>(DI.drizzle);
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(async () => {
		alice = await createUser({ username: 'alice' });
		bob = await createUser({ username: 'bob' });
		driveFile1 = await createDriveFile();
		driveFile2 = await createDriveFile();
		channel1 = await createChannel({ name: 'channel1', userId: alice.id, bannerId: driveFile1.id });
		channel2 = await createChannel({ name: 'channel2', userId: alice.id, bannerId: driveFile2.id });
		channel3 = await createChannel({ name: 'channel3', userId: alice.id, bannerId: driveFile2.id });
	});

	afterEach(async () => {
		await drizzle.delete(channelMuting);
		await drizzle.delete(channel);
		await drizzle.delete(driveFile);
		await drizzle.delete(userProfile);
		await drizzle.delete(user);
	});

	describe('list', () => {
		test('default', async () => {
			await createChannelMuting({ userId: alice.id, channelId: channel1.id });
			await createChannelMuting({ userId: alice.id, channelId: channel2.id });
			await createChannelMuting({ userId: bob.id, channelId: channel3.id });

			const mutings = await service.list({ requestUserId: alice.id });

			expect(mutings).toHaveLength(2);
			expect(mutings[0].id).toBe(channel1.id);
			expect(mutings[0].userId).toBe(alice.id);
			expect(mutings[0].user).toBeFalsy();
			expect(mutings[0].bannerId).toBe(driveFile1.id);
			expect(mutings[0].banner).toBeFalsy();
			expect(mutings[1].id).toBe(channel2.id);
			expect(mutings[1].userId).toBe(alice.id);
			expect(mutings[1].user).toBeFalsy();
			expect(mutings[1].bannerId).toBe(driveFile2.id);
			expect(mutings[1].banner).toBeFalsy();
		});

		test('withoutExpires', async () => {
			const now = new Date();
			const past = new Date(now);
			const future = new Date(now);
			past.setMinutes(past.getMinutes() - 1);
			future.setMinutes(future.getMinutes() + 1);

			await createChannelMuting({ userId: alice.id, channelId: channel1.id, expiresAt: past });
			await createChannelMuting({ userId: alice.id, channelId: channel2.id, expiresAt: null });
			await createChannelMuting({ userId: alice.id, channelId: channel3.id, expiresAt: future });

			const mutings = await service.list({ requestUserId: alice.id });

			expect(mutings).toHaveLength(2);
			expect(mutings[0].id).toBe(channel2.id);
			expect(mutings[1].id).toBe(channel3.id);
		});

		test('idOnly', async () => {
			await createChannelMuting({ userId: alice.id, channelId: channel1.id });
			await createChannelMuting({ userId: alice.id, channelId: channel2.id });
			await createChannelMuting({ userId: bob.id, channelId: channel3.id });

			const mutings = await service.list({ requestUserId: alice.id }, { idOnly: true });

			expect(mutings).toHaveLength(2);
			expect(mutings[0].id).toBe(channel1.id);
			expect(mutings[1].id).toBe(channel2.id);
		});

		test('withoutExpires-idOnly', async () => {
			const now = new Date();
			const past = new Date(now);
			const future = new Date(now);
			past.setMinutes(past.getMinutes() - 1);
			future.setMinutes(future.getMinutes() + 1);

			await createChannelMuting({ userId: alice.id, channelId: channel1.id, expiresAt: past });
			await createChannelMuting({ userId: alice.id, channelId: channel2.id, expiresAt: null });
			await createChannelMuting({ userId: alice.id, channelId: channel3.id, expiresAt: future });

			const mutings = await service.list({ requestUserId: alice.id }, { idOnly: true });

			expect(mutings).toHaveLength(2);
			expect(mutings[0].id).toBe(channel2.id);
			expect(mutings[1].id).toBe(channel3.id);
		});

		test('joinUser', async () => {
			await createChannelMuting({ userId: alice.id, channelId: channel1.id });
			await createChannelMuting({ userId: alice.id, channelId: channel2.id });
			await createChannelMuting({ userId: bob.id, channelId: channel3.id });

			const mutings = await service.list({ requestUserId: alice.id }, { joinUser: true });

			expect(mutings).toHaveLength(2);
			expect(mutings[0].id).toBe(channel1.id);
			expect(mutings[0].user).toEqual(alice);
			expect(mutings[0].banner).toBeFalsy();
			expect(mutings[1].id).toBe(channel2.id);
			expect(mutings[1].user).toEqual(alice);
			expect(mutings[1].banner).toBeFalsy();
		});

		test('joinBannerFile', async () => {
			await createChannelMuting({ userId: alice.id, channelId: channel1.id });
			await createChannelMuting({ userId: alice.id, channelId: channel2.id });
			await createChannelMuting({ userId: bob.id, channelId: channel3.id });

			const mutings = await service.list({ requestUserId: alice.id }, { joinBannerFile: true });

			expect(mutings).toHaveLength(2);
			expect(mutings[0].id).toBe(channel1.id);
			expect(mutings[0].user).toBeFalsy();
			expect(mutings[0].banner).toEqual(driveFile1);
			expect(mutings[1].id).toBe(channel2.id);
			expect(mutings[1].user).toBeFalsy();
			expect(mutings[1].banner).toEqual(driveFile2);
		});
	});

	describe('findExpiredMutings', () => {
		test('default', async () => {
			const now = new Date();
			const future = new Date(now);
			const past = new Date(now);
			future.setMinutes(now.getMinutes() + 1);
			past.setMinutes(now.getMinutes() - 1);

			await createChannelMuting({ userId: alice.id, channelId: channel1.id, expiresAt: past });
			await createChannelMuting({ userId: alice.id, channelId: channel2.id, expiresAt: future });
			await createChannelMuting({ userId: bob.id, channelId: channel3.id, expiresAt: past });

			const mutings = await service.findExpiredMutings();

			expect(mutings).toHaveLength(2);
			expect(mutings[0].channelId).toBe(channel1.id);
			expect(mutings[1].channelId).toBe(channel3.id);
		});
	});

	describe('isMuted', () => {
		test('isMuted: true', async () => {
			// キャッシュを読むのでServiceの機能を使って登録し、キャッシュを作成する
			await service.mute({ requestUserId: alice.id, targetChannelId: channel1.id });
			await service.mute({ requestUserId: alice.id, targetChannelId: channel2.id });

			await setTimeout(500);

			const result = await service.isMuted({ requestUserId: alice.id, targetChannelId: channel1.id });

			expect(result).toBe(true);
		});

		test('isMuted: false', async () => {
			await service.mute({ requestUserId: alice.id, targetChannelId: channel2.id });

			await setTimeout(500);

			const result = await service.isMuted({ requestUserId: alice.id, targetChannelId: channel1.id });

			expect(result).toBe(false);
		});
	});

	describe('mute', () => {
		test('default', async () => {
			await service.mute({ requestUserId: alice.id, targetChannelId: channel1.id });

			const muting = await fetchChannelMuting();
			expect(muting).toHaveLength(1);
			expect(muting[0].channelId).toBe(channel1.id);
		});
	});

	describe('unmute', () => {
		test('default', async () => {
			await createChannelMuting({ userId: alice.id, channelId: channel1.id });

			let muting = await fetchChannelMuting();
			expect(muting).toHaveLength(1);
			expect(muting[0].channelId).toBe(channel1.id);

			await service.unmute({ requestUserId: alice.id, targetChannelId: channel1.id });

			muting = await fetchChannelMuting();
			expect(muting).toHaveLength(0);
		});
	});

	describe('eraseExpiredMutings', () => {
		test('default', async () => {
			const now = new Date();
			const future = new Date(now);
			const past = new Date(now);
			future.setMinutes(now.getMinutes() + 1);
			past.setMinutes(now.getMinutes() - 1);

			await createChannelMuting({ userId: alice.id, channelId: channel1.id, expiresAt: past });
			await createChannelMuting({ userId: alice.id, channelId: channel2.id, expiresAt: future });
			await createChannelMuting({ userId: bob.id, channelId: channel3.id, expiresAt: past });

			await service.eraseExpiredMutings();

			const mutings = await fetchChannelMuting();
			expect(mutings).toHaveLength(1);
			expect(mutings[0].channelId).toBe(channel2.id);
		});
	});
});
