/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fetchUserProfileByEmailFromDatabase } from '@/core/UserProfileStore.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import type { SchemaType } from '@/misc/json-schema.js';
import { HonoApiError } from './hono-api-error.js';
import { packUserDetailedNotMeForHonoApi, type UserDetailedNotMeHonoApiResponse, type UserPackingDependencies } from './hono-api-user.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiAdminAccountsDependencies = UserPackingDependencies;

const adminAccountsFindByEmailParamDef = {
	type: 'object',
	properties: {
		email: { type: 'string' },
	},
	required: ['email'],
} as const;

type AdminAccountsFindByEmailParams = SchemaType<typeof adminAccountsFindByEmailParamDef>;

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
