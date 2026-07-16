/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Config } from '@/config.js';
import { RootUserAlreadyAssignedError } from '@/core/SignupStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/Meta.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { handleHonoApiAdminAccountsCreate, type HonoApiAdminAccountsDependencies } from '@/server/rest/admin-accounts.js';
import type { SignupResponse } from '@/server/rest/signup.js';

const { createLocalSignupAccountMock, fetchMetaFromDatabaseMock, hashPasswordMock, packSignupUserMock } = vi.hoisted(() => ({
	createLocalSignupAccountMock: vi.fn(),
	fetchMetaFromDatabaseMock: vi.fn(),
	hashPasswordMock: vi.fn(),
	packSignupUserMock: vi.fn(),
}));

vi.mock('@/core/MetaStore.js', () => ({
	fetchMetaFromDatabase: fetchMetaFromDatabaseMock,
}));

vi.mock('@/misc/password.js', () => ({
	hashPassword: hashPasswordMock,
}));

vi.mock('@/server/rest/signup.js', () => ({
	createLocalSignupAccount: createLocalSignupAccountMock,
	packSignupUser: packSignupUserMock,
}));

function createDeps(setupPassword: string | null = null): HonoApiAdminAccountsDependencies {
	return {
		config: { instance: { setupPassword } } as unknown as Config,
		db: {} as MiDrizzleDatabase,
		meta: { id: 'x', rootUserId: null, rootUser: null } as MiMeta,
	} as HonoApiAdminAccountsDependencies;
}

describe('handleHonoApiAdminAccountsCreate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hashPasswordMock.mockResolvedValue('hashed');
	});

	test('rejects a non-root native user when the reactive meta is stale', async () => {
		fetchMetaFromDatabaseMock.mockResolvedValue({ rootUserId: 'root' } as MiMeta);

		await expect(handleHonoApiAdminAccountsCreate(createDeps(), {
			user: { id: 'not-root' } as MiLocalUser,
			token: null,
		}, {
			username: 'created',
			password: 'password',
		})).rejects.toMatchObject({ code: 'ACCESS_DENIED' });

		expect(createLocalSignupAccountMock).not.toHaveBeenCalled();
	});

	test('skips the root claim for the authoritative root user', async () => {
		const account = { id: 'created' } as MiUser;
		const response = { id: 'created', token: 'token' } as unknown as SignupResponse;
		fetchMetaFromDatabaseMock.mockResolvedValue({ rootUserId: 'root' } as MiMeta);
		createLocalSignupAccountMock.mockResolvedValue({ account, token: 'token' });
		packSignupUserMock.mockResolvedValue(response);

		await expect(handleHonoApiAdminAccountsCreate(createDeps(), {
			user: { id: 'root' } as MiLocalUser,
			token: null,
		}, {
			username: 'created',
			password: 'password',
		})).resolves.toBe(response);

		expect(createLocalSignupAccountMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
			rootClaim: 'skip',
		}));
	});

	test('does not create a normal account when another process claims root first', async () => {
		fetchMetaFromDatabaseMock.mockResolvedValue({ rootUserId: null } as MiMeta);
		createLocalSignupAccountMock.mockRejectedValue(new RootUserAlreadyAssignedError());

		await expect(handleHonoApiAdminAccountsCreate(createDeps(), {
			user: null,
			token: null,
		}, {
			username: 'created',
			password: 'password',
		})).rejects.toMatchObject({ code: 'ACCESS_DENIED' });

		expect(createLocalSignupAccountMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
			rootClaim: 'required',
		}));
	});

	test('validates the setup password against the authoritative root state', async () => {
		fetchMetaFromDatabaseMock.mockResolvedValue({ rootUserId: null } as MiMeta);

		await expect(handleHonoApiAdminAccountsCreate(createDeps('secret'), {
			user: null,
			token: null,
		}, {
			username: 'created',
			password: 'password',
			setupPassword: 'wrong',
		})).rejects.toMatchObject({ code: 'INCORRECT_INITIAL_PASSWORD' });

		expect(createLocalSignupAccountMock).not.toHaveBeenCalled();
	});
});
