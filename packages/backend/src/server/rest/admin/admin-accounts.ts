/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { deleteAccountWithSideEffects } from '@/core/account/DeleteAccountLogic.js';
import { fetchMetaFromDatabase } from '@/core/meta/MetaStore.js';
import { logModerationEventInDatabase } from '@/core/moderation/ModerationLogLogic.js';
import type { DbQueue, DeliverQueue } from '@/core/queue/queues.js';
import { RootUserAlreadyAssignedError } from '@/core/account/SignupStore.js';
import { fetchOrCreateSystemAccount } from '@/core/system-account/system-account-runtime.js';
import { updateSystemAccountUserInDatabase } from '@/core/system-account/SystemAccountStore.js';
import { fetchUserProfileByEmailFromDatabase } from '@/core/user/UserProfileStore.js';
import { fetchUserByIdFromDatabase, fetchUserByIdOrFailFromDatabase } from '@/core/user/UserStore.js';
import { misskeyId } from '@/misc/zod-params.js';
import { omitUndefined } from '@/misc/clone.js';
import { descriptionSchema, localUsernameSchema, passwordSchema } from '@/models/User.js';
import type { MiLocalUser } from '@/models/User.js';
import { hashPassword } from '@/misc/password.js';
import { HonoApiError } from '../error.js';
import type { HonoApiAuthenticated } from '../auth/auth.js';
import type { HonoApiInternalEventPublisher } from '../events.js';
import { isHonoApiAdministrator } from '../role/role-policy.js';
import {
	createLocalSignupAccount,
	packSignupUser,
	type SignupDependencies,
	type SignupResponse,
} from '../auth/signup.js';
import {
	packMeDetailedForHonoApi,
	packUserDetailedNotMeForHonoApi,
	type MeDetailedHonoApiResponse,
	type UserDetailedNotMeHonoApiResponse,
	type UserPackingDependencies,
} from '../user/user.js';
import { parseHonoApiParams } from '../validation.js';

export type HonoApiAdminAccountsDependencies = UserPackingDependencies &
	SignupDependencies & {
		dbQueue: DbQueue;
		deliverQueue: DeliverQueue;
		publishInternalEvent?: HonoApiInternalEventPublisher;
	};

export const adminAccountCreateParamDef = z.object({
	username: localUsernameSchema,
	password: passwordSchema,
	setupPassword: z.string().nullable().optional(),
});

export const adminAccountsFindByEmailParamDef = z.object({
	email: z.string(),
});

export const adminAccountDeleteParamDef = z.object({
	userId: misskeyId(),
});

export const adminUpdateProxyAccountParamDef = z.object({
	description: descriptionSchema.nullable().optional(),
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

function adminAccountNoSuchUserError(id: string): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such user.',
		code: 'NO_SUCH_USER',
		id,
	});
}

export async function handleHonoApiAdminAccountsCreate(
	deps: HonoApiAdminAccountsDependencies,
	auth: HonoApiAuthenticated,
	body: Record<string, unknown>,
): Promise<SignupResponse> {
	const params = parseHonoApiParams(adminAccountCreateParamDef, body);
	const currentMeta = await fetchMetaFromDatabase(deps.db);
	const rootUserId = currentMeta.rootUserId;

	if (rootUserId == null && auth.user == null && auth.token == null) {
		if (deps.config.instance.setupPassword != null) {
			if (params.setupPassword !== deps.config.instance.setupPassword) {
				throw adminAccountCreateWrongInitialPasswordError();
			}
		} else if (params.setupPassword != null && params.setupPassword.trim() !== '') {
			throw adminAccountCreateWrongInitialPasswordError();
		}
	} else if (
		auth.token !== null ||
		// root だけに限ると、後から管理者ロールを付与したアカウントがこのAPIを使えない
		!(await isHonoApiAdministrator({ ...deps, meta: currentMeta }, auth.user))
	) {
		throw adminAccountCreateAccessDeniedError();
	}

	let created: Awaited<ReturnType<typeof createLocalSignupAccount>>;
	try {
		created = await createLocalSignupAccount(deps, {
			username: params.username,
			passwordHash: await hashPassword(params.password),
			host: null,
			ignorePreservedUsernames: true,
			rootClaim: rootUserId == null ? 'required' : 'skip',
		});
	} catch (error) {
		if (error instanceof RootUserAlreadyAssignedError) throw adminAccountCreateAccessDeniedError();
		throw error;
	}

	return await packSignupUser(deps, created.account, created.token);
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
		throw adminAccountNoSuchUserError('f26ff6c4-278d-4c07-af5a-224c9d1e53f3');
	}

	await deleteAccountWithSideEffects(deps, user, me);
}

export async function handleHonoApiAdminDeleteAccount(
	deps: HonoApiAdminAccountsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminAccountDeleteParamDef, body);
	const user = await fetchUserByIdFromDatabase(deps.db, params.userId);
	if (user == null) {
		throw adminAccountNoSuchUserError('7ccf53b8-f359-45a7-b376-5f05a7bdfa93');
	}
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
	const updated = await updateSystemAccountUserInDatabase(
		deps.db,
		omitUndefined({
			userId: proxy.id,
			description: params.description,
		}),
	);

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
