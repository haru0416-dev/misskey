/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Config } from '@/config.js';
import { RootUserAlreadyAssignedError } from '@/core/account/SignupStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/Meta.js';
import type { MiRole } from '@/models/Role.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { handleApiAdminAccountsCreate, type ApiAdminAccountsDependencies } from '@/server/rest/admin/admin-accounts.js';
import type { SignupResponse } from '@/server/rest/auth/signup.js';

const {
	createLocalSignupAccountMock,
	fetchMetaFromDatabaseMock,
	hashPasswordMock,
	listRoleAssignmentsByUserIdFromDatabaseMock,
	listRolesFromDatabaseMock,
	packSignupUserMock,
} = vi.hoisted(() => ({
	createLocalSignupAccountMock: vi.fn(),
	fetchMetaFromDatabaseMock: vi.fn(),
	hashPasswordMock: vi.fn(),
	listRoleAssignmentsByUserIdFromDatabaseMock: vi.fn(),
	listRolesFromDatabaseMock: vi.fn(),
	packSignupUserMock: vi.fn(),
}));

vi.mock('@/core/meta/MetaStore.js', () => ({
	fetchMetaFromDatabase: fetchMetaFromDatabaseMock,
}));

vi.mock('@/core/role/RoleStore.js', () => ({
	listRolesFromDatabase: listRolesFromDatabaseMock,
}));

vi.mock('@/core/role/RoleAssignmentStore.js', () => ({
	listRoleAssignmentsByUserIdFromDatabase: listRoleAssignmentsByUserIdFromDatabaseMock,
}));

vi.mock('@/misc/password.js', () => ({
	hashPassword: hashPasswordMock,
}));

vi.mock('@/server/rest/auth/signup.js', () => ({
	createLocalSignupAccount: createLocalSignupAccountMock,
	packSignupUser: packSignupUserMock,
}));

function createDeps(setupPassword: string | null = null): ApiAdminAccountsDependencies {
	return {
		config: { instance: { setupPassword } } as unknown as Config,
		db: {} as MiDrizzleDatabase,
		meta: { id: 'x', rootUserId: null, rootUser: null } as MiMeta,
	} as ApiAdminAccountsDependencies;
}

describe('handleApiAdminAccountsCreate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hashPasswordMock.mockResolvedValue('hashed');
		listRolesFromDatabaseMock.mockResolvedValue([]);
		listRoleAssignmentsByUserIdFromDatabaseMock.mockResolvedValue([]);
	});

	test('rejects a non-root native user when the reactive meta is stale', async () => {
		fetchMetaFromDatabaseMock.mockResolvedValue({ rootUserId: 'root' } as MiMeta);

		await expect(
			handleApiAdminAccountsCreate(
				createDeps(),
				{
					user: { id: 'not-root' } as MiLocalUser,
					token: null,
				},
				{
					username: 'created',
					password: 'password',
				},
			),
		).rejects.toMatchObject({ code: 'ACCESS_DENIED' });

		expect(createLocalSignupAccountMock).not.toHaveBeenCalled();
	});

	test('skips the root claim for the authoritative root user', async () => {
		const account = { id: 'created' } as MiUser;
		const response = { id: 'created', token: 'token' } as unknown as SignupResponse;
		fetchMetaFromDatabaseMock.mockResolvedValue({ rootUserId: 'root' } as MiMeta);
		createLocalSignupAccountMock.mockResolvedValue({ account, token: 'token' });
		packSignupUserMock.mockResolvedValue(response);

		await expect(
			handleApiAdminAccountsCreate(
				createDeps(),
				{
					user: { id: 'root' } as MiLocalUser,
					token: null,
				},
				{
					username: 'created',
					password: 'password',
				},
			),
		).resolves.toBe(response);

		expect(createLocalSignupAccountMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				rootClaim: 'skip',
			}),
		);
	});

	test('accepts a non-root user who holds an administrator role', async () => {
		const account = { id: 'created' } as MiUser;
		const response = { id: 'created', token: 'token' } as unknown as SignupResponse;
		fetchMetaFromDatabaseMock.mockResolvedValue({ rootUserId: 'root' } as MiMeta);
		listRolesFromDatabaseMock.mockResolvedValue([{ id: 'admins', isAdministrator: true } as MiRole]);
		listRoleAssignmentsByUserIdFromDatabaseMock.mockResolvedValue([{ roleId: 'admins', expiresAt: null }]);
		createLocalSignupAccountMock.mockResolvedValue({ account, token: 'token' });
		packSignupUserMock.mockResolvedValue(response);

		await expect(
			handleApiAdminAccountsCreate(
				createDeps(),
				{
					user: { id: 'not-root' } as MiLocalUser,
					token: null,
				},
				{
					username: 'created',
					password: 'password',
				},
			),
		).resolves.toBe(response);
	});

	test('does not create a normal account when another process claims root first', async () => {
		fetchMetaFromDatabaseMock.mockResolvedValue({ rootUserId: null } as MiMeta);
		createLocalSignupAccountMock.mockRejectedValue(new RootUserAlreadyAssignedError());

		await expect(
			handleApiAdminAccountsCreate(
				createDeps(),
				{
					user: null,
					token: null,
				},
				{
					username: 'created',
					password: 'password',
				},
			),
		).rejects.toMatchObject({ code: 'ACCESS_DENIED' });

		expect(createLocalSignupAccountMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				rootClaim: 'required',
			}),
		);
	});

	test('validates the setup password against the authoritative root state', async () => {
		fetchMetaFromDatabaseMock.mockResolvedValue({ rootUserId: null } as MiMeta);

		await expect(
			handleApiAdminAccountsCreate(
				createDeps('secret'),
				{
					user: null,
					token: null,
				},
				{
					username: 'created',
					password: 'password',
					setupPassword: 'wrong',
				},
			),
		).rejects.toMatchObject({ code: 'INCORRECT_INITIAL_PASSWORD' });

		expect(createLocalSignupAccountMock).not.toHaveBeenCalled();
	});
});
