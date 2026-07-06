/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { deleteAccountWithSideEffects } from '@/core/DeleteAccountLogic.js';
import { logModerationEventInDatabase } from '@/core/ModerationLogLogic.js';
import type { DbQueue, DeliverQueue } from '@/core/QueueModule.js';
import { fetchOrCreateSystemAccount } from '@/core/system-account-runtime.js';
import { updateSystemAccountUserInDatabase } from '@/core/SystemAccountStore.js';
import { fetchUserProfileByEmailFromDatabase } from '@/core/UserProfileStore.js';
import { fetchUserByIdFromDatabase, fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import type { SchemaType } from '@/misc/json-schema.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiUser } from '@/models/_.js';
import { descriptionZodSchema, localUsernameZodSchema, passwordZodSchema } from '@/models/User.js';
import type { MiLocalUser } from '@/models/User.js';
import bcrypt from 'bcryptjs';
import { HonoApiError } from './error.js';
import type { HonoApiAuthenticated } from './auth.js';
import type { HonoApiInternalEventPublisher } from './events.js';
import { createLocalSignupAccount, packSignupUser, type SignupDependencies, type SignupResponse } from './signup.js';
import { packMeDetailedForHonoApi, packUserDetailedNotMeForHonoApi, type MeDetailedHonoApiResponse, type UserDetailedNotMeHonoApiResponse, type UserPackingDependencies } from './user.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiAdminAccountsDependencies = UserPackingDependencies & SignupDependencies & {
	dbQueue: DbQueue;
	deliverQueue: DeliverQueue;
	publishInternalEvent?: HonoApiInternalEventPublisher;
};

const adminAccountCreateParamDef = z.object({
	username: localUsernameZodSchema,
	password: passwordZodSchema,
	setupPassword: z.string().nullable().optional(),
});

const adminAccountsFindByEmailParamDef = z.object({
	email: z.string(),
});

const adminAccountDeleteParamDef = z.object({
	userId: misskeyId(),
});

const adminUpdateProxyAccountParamDef = z.object({
	description: descriptionZodSchema.nullable().optional(),
});


function userNotFoundError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such user who has the email address.',
		code: 'USER_NOT_FOUND',
		id: 'cb865949-8af5-4062-a88c-ef55e8786d1d',
	});
}

function adminAccountCreateAccessDeniedError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Access denied.',
		code: 'ACCESS_DENIED',
		id: '1fb7cb09-d46a-4fff-b8df-057708cce513',
	});
}

function adminAccountCreateWrongInitialPasswordError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Initial password is incorrect.',
		code: 'INCORRECT_INITIAL_PASSWORD',
		id: '97147c55-1ae1-4f6f-91d6-e1c3e0e76d62',
	});
}

export async function handleHonoApiAdminAccountsCreate(
	deps: HonoApiAdminAccountsDependencies,
	auth: HonoApiAuthenticated,
	body: Record<string, unknown>,
): Promise<SignupResponse> {
	const params = parseHonoApiParams(adminAccountCreateParamDef, body);

	if (deps.meta.rootUserId == null && auth.user == null && auth.token == null) {
		if (deps.config.setupPassword != null) {
			if (params.setupPassword !== deps.config.setupPassword) {
				throw adminAccountCreateWrongInitialPasswordError();
			}
		} else if (params.setupPassword != null && params.setupPassword.trim() !== '') {
			throw adminAccountCreateWrongInitialPasswordError();
		}
	} else if ((deps.meta.rootUserId != null && (deps.meta.rootUserId !== auth.user?.id)) || auth.token !== null) {
		throw adminAccountCreateAccessDeniedError();
	}

	const salt = await bcrypt.genSalt(8);
	const { account, token } = await createLocalSignupAccount(deps, {
		username: params.username,
		passwordHash: await bcrypt.hash(params.password, salt),
		host: null,
		ignorePreservedUsernames: true,
	});

	return await packSignupUser(deps, account, token);
}

export async function handleHonoApiAdminAccountsFindByEmail(
	deps: HonoApiAdminAccountsDependencies,
	body: Record<string, unknown>,
): Promise<UserDetailedNotMeHonoApiResponse> {
	const params = parseHonoApiParams(adminAccountsFindByEmailParamDef, body);
	const profile = await fetchUserProfileByEmailFromDatabase(deps.db, params.email);

	if (profile == null) {
		throw userNotFoundError();
	}

	return await packUserDetailedNotMeForHonoApi(deps, await fetchUserByIdOrFailFromDatabase(deps.db, profile.userId));
}

export async function handleHonoApiAdminAccountsDelete(
	deps: HonoApiAdminAccountsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminAccountDeleteParamDef, body);
	const user = await fetchUserByIdFromDatabase(deps.db, params.userId);

	if (user == null) {
		throw new Error('user not found');
	}

	await deleteAccountWithSideEffects(deps, user, me);
}

export async function handleHonoApiAdminDeleteAccount(
	deps: HonoApiAdminAccountsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminAccountDeleteParamDef, body);
	const user = await fetchUserByIdOrFailFromDatabase(deps.db, params.userId);
	if (user.isDeleted) {
		return;
	}

	await deleteAccountWithSideEffects(deps, user, me);
}

export async function handleHonoApiAdminUpdateProxyAccount(
	deps: HonoApiAdminAccountsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<MeDetailedHonoApiResponse> {
	const params = parseHonoApiParams(adminUpdateProxyAccountParamDef, body);
	const proxy = await fetchOrCreateSystemAccount(deps.db, deps.config, deps.meta, 'proxy');
	const updated = await updateSystemAccountUserInDatabase(deps.db, {
		userId: proxy.id,
		description: params.description,
	});

	if (params.description !== undefined) {
		void logModerationEventInDatabase(deps, me, 'updateProxyAccountDescription', {
			before: null,
			after: params.description,
		});
	}

	return await packMeDetailedForHonoApi(deps, updated, {
		includeSecrets: false,
	});
}
