/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { logModerationEventInDatabase } from '@/core/ModerationLogLogic.js';
import { fetchOrCreateSystemAccount } from '@/core/system-account-runtime.js';
import { updateSystemAccountUserInDatabase } from '@/core/SystemAccountStore.js';
import { fetchUserProfileByEmailFromDatabase } from '@/core/UserProfileStore.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import type { SchemaType } from '@/misc/json-schema.js';
import { descriptionSchema } from '@/models/User.js';
import type { MiLocalUser } from '@/models/User.js';
import { HonoApiError } from './hono-api-error.js';
import { packMeDetailedForHonoApi, packUserDetailedNotMeForHonoApi, type MeDetailedHonoApiResponse, type UserDetailedNotMeHonoApiResponse, type UserPackingDependencies } from './hono-api-user.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiAdminAccountsDependencies = UserPackingDependencies;

const adminAccountsFindByEmailParamDef = {
	type: 'object',
	properties: {
		email: { type: 'string' },
	},
	required: ['email'],
} as const;

const adminUpdateProxyAccountParamDef = {
	type: 'object',
	properties: {
		description: { ...descriptionSchema, nullable: true },
	},
} as const;

type AdminAccountsFindByEmailParams = SchemaType<typeof adminAccountsFindByEmailParamDef>;
type AdminUpdateProxyAccountParams = SchemaType<typeof adminUpdateProxyAccountParamDef>;

function userNotFoundError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such user who has the email address.',
		code: 'USER_NOT_FOUND',
		id: 'cb865949-8af5-4062-a88c-ef55e8786d1d',
	});
}

export async function handleHonoApiAdminAccountsFindByEmail(
	deps: HonoApiAdminAccountsDependencies,
	body: Record<string, unknown>,
): Promise<UserDetailedNotMeHonoApiResponse> {
	const params = parseHonoApiParams(adminAccountsFindByEmailParamDef, body) as AdminAccountsFindByEmailParams;
	const profile = await fetchUserProfileByEmailFromDatabase(deps.db, params.email);

	if (profile == null) {
		throw userNotFoundError();
	}

	return await packUserDetailedNotMeForHonoApi(deps, await fetchUserByIdOrFailFromDatabase(deps.db, profile.userId));
}

export async function handleHonoApiAdminUpdateProxyAccount(
	deps: HonoApiAdminAccountsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<MeDetailedHonoApiResponse> {
	const params = parseHonoApiParams(adminUpdateProxyAccountParamDef, body) as AdminUpdateProxyAccountParams;
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
