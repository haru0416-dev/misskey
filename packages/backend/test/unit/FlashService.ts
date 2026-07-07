/* eslint-disable @typescript-eslint/no-unused-vars */
/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, afterEach, beforeEach, describe, expect, test } from 'vitest';
import { FlashService } from '@/core/FlashService.js';
import { IdService } from '@/core/IdService.js';
import type { MiUser } from '@/models/User.js';
import { loadConfig } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool } from '@/drizzle.js';
import type { MiDrizzleDatabase, MiDrizzlePool } from '@/drizzle.js';
import { user, type UserInsert } from '@/db/schema/user.js';
import { userProfile } from '@/db/schema/user-profile.js';
import { flash, type FlashInsert } from '@/db/schema/flash.js';
import { flashLike } from '@/db/schema/flash-like.js';
import { createFlashInDatabase } from '@/core/FlashStore.js';
import { createUserInDatabase } from '@/core/UserStore.js';
import { createUserProfileInDatabase } from '@/core/UserProfileStore.js';

describe('FlashService', () => {
	let pool: MiDrizzlePool;
	let service: FlashService;

	// --------------------------------------------------------------------------------------

	let drizzle: MiDrizzleDatabase;
	let idService: IdService;

	// --------------------------------------------------------------------------------------

	let root: MiUser;
	let alice: MiUser;
	let bob: MiUser;

	// --------------------------------------------------------------------------------------

	async function createFlash(data: Partial<FlashInsert>) {
		return createFlashInDatabase(drizzle, {
			id: idService.gen(),
			updatedAt: new Date(),
			userId: root.id,
			title: 'title',
			summary: 'summary',
			script: 'script',
			permissions: [],
			likedCount: 0,
			...data,
		});
	}

	async function createUser(data: Partial<UserInsert> & Pick<UserInsert, 'username' | 'usernameLower'>) {
		const user = await createUserInDatabase(drizzle, {
			id: idService.gen(),
			...data,
		});

		await createUserProfileInDatabase(drizzle, {
			userId: user.id,
		});

		return user;
	}

	// --------------------------------------------------------------------------------------

	beforeEach(async () => {
		const config = loadConfig();
		pool = createDrizzlePool(config);
		drizzle = createDrizzleDatabase(pool, config);
		idService = new IdService(config);

		service = new FlashService(drizzle, idService);

		root = await createUser({ username: 'root', usernameLower: 'root' });
		alice = await createUser({ username: 'alice', usernameLower: 'alice' });
		bob = await createUser({ username: 'bob', usernameLower: 'bob' });
	});

	afterEach(async () => {
		await drizzle.delete(flashLike);
		await drizzle.delete(flash);
		await drizzle.delete(userProfile);
		await drizzle.delete(user);
	});

	afterAll(async () => {
		await pool.end();
	});

	// --------------------------------------------------------------------------------------

	describe('featured', () => {
		test('should return featured flashes', async () => {
			const flash1 = await createFlash({ likedCount: 1 });
			const flash2 = await createFlash({ likedCount: 2 });
			const flash3 = await createFlash({ likedCount: 3 });

			const result = await service.featured({
				offset: 0,
				limit: 10,
			});

			expect(result).toEqual([flash3, flash2, flash1]);
		});

		test('should return featured flashes public visibility only', async () => {
			const flash1 = await createFlash({ likedCount: 1, visibility: 'public' });
			const flash2 = await createFlash({ likedCount: 2, visibility: 'public' });
			const flash3 = await createFlash({ likedCount: 3, visibility: 'private' });

			const result = await service.featured({
				offset: 0,
				limit: 10,
			});

			expect(result).toEqual([flash2, flash1]);
		});

		test('should return featured flashes with offset', async () => {
			const flash1 = await createFlash({ likedCount: 1 });
			const flash2 = await createFlash({ likedCount: 2 });
			const flash3 = await createFlash({ likedCount: 3 });

			const result = await service.featured({
				offset: 1,
				limit: 10,
			});

			expect(result).toEqual([flash2, flash1]);
		});

		test('should return featured flashes with limit', async () => {
			const flash1 = await createFlash({ likedCount: 1 });
			const flash2 = await createFlash({ likedCount: 2 });
			const flash3 = await createFlash({ likedCount: 3 });

			const result = await service.featured({
				offset: 0,
				limit: 2,
			});

			expect(result).toEqual([flash3, flash2]);
		});
	});
});
