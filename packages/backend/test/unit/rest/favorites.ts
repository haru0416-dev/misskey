/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import type { MiLocalUser } from '@/models/User.js';

const {
	clipFavoriteExistsMock,
	createClipFavoriteMock,
	createUserListFavoriteMock,
	fetchClipMock,
	userListExistsMock,
	userListFavoriteExistsMock,
} = vi.hoisted(() => ({
	clipFavoriteExistsMock: vi.fn(),
	createClipFavoriteMock: vi.fn(),
	createUserListFavoriteMock: vi.fn(),
	fetchClipMock: vi.fn(),
	userListExistsMock: vi.fn(),
	userListFavoriteExistsMock: vi.fn(),
}));

vi.mock('@/core/ClipFavoriteStore.js', () => ({
	clipFavoriteExistsInDatabase: clipFavoriteExistsMock,
	createClipFavoriteInDatabase: createClipFavoriteMock,
	deleteClipFavoriteByIdFromDatabase: vi.fn(),
	fetchClipFavoriteFromDatabase: vi.fn(),
}));

vi.mock('@/core/ClipStore.js', () => ({
	fetchClipByIdFromDatabase: fetchClipMock,
}));

vi.mock('@/core/UserListFavoriteStore.js', () => ({
	createUserListFavoriteInDatabase: createUserListFavoriteMock,
	deleteUserListFavoriteByIdFromDatabase: vi.fn(),
	fetchUserListFavoriteFromDatabase: vi.fn(),
	userListFavoriteExistsInDatabase: userListFavoriteExistsMock,
}));

vi.mock('@/core/UserListStore.js', () => ({
	userListExistsByIdAndPublicFromDatabase: userListExistsMock,
}));

import { handleHonoApiClipsFavorite, handleHonoApiUsersListsFavorite } from '@/server/rest/favorites.js';

describe('favorites REST handlers', () => {
	const userId = genId();
	const resourceId = genId();
	const deps = {
		config: {} as Config,
		db: {} as MiDrizzleDatabase,
	};
	const me = { id: userId } as MiLocalUser;

	beforeEach(() => {
		vi.clearAllMocks();
		userListExistsMock.mockResolvedValue(true);
		userListFavoriteExistsMock.mockResolvedValue(false);
		clipFavoriteExistsMock.mockResolvedValue(false);
		fetchClipMock.mockResolvedValue({ id: resourceId, userId: genId(), isPublic: true });
	});

	test('converts a duplicate user-list favorite insertion to ALREADY_FAVORITED', async () => {
		createUserListFavoriteMock.mockRejectedValue({ cause: { code: '23505' } });

		await expect(
			handleHonoApiUsersListsFavorite(deps, me, {
				listId: resourceId,
			}),
		).rejects.toMatchObject({
			status: 400,
			code: 'ALREADY_FAVORITED',
			id: '6425bba0-985b-461e-af1b-518070e72081',
		});
	});

	test('converts a duplicate clip favorite insertion to ALREADY_FAVORITED', async () => {
		createClipFavoriteMock.mockRejectedValue({ driverError: { code: '23505' } });

		await expect(
			handleHonoApiClipsFavorite(deps, me, {
				clipId: resourceId,
			}),
		).rejects.toMatchObject({
			status: 400,
			code: 'ALREADY_FAVORITED',
			id: '92658936-c625-4273-8326-2d790129256e',
		});
	});
});
