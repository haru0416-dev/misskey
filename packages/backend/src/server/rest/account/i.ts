/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ApiParams } from '../validation.js';
import { z } from 'zod';
import { fetchUserByIdOrFailFromDatabase } from '@/core/user/UserStore.js';
import { fetchUserProfileByUserIdFromDatabase, updateUserProfileInDatabase } from '@/core/user/UserProfileStore.js';
import { listSigninHistoryFromDatabase } from '@/core/account/SigninStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { parseId } from '@/misc/id/parse-id.js';
import { paginationParams } from '@/misc/zod-params.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type { MiSignin } from '@/models/Signin.js';
import type { MiLocalUser } from '@/models/User.js';
import { userDeletedError } from '../error.js';
import { packMeDetailedForApi } from '../user/user.js';
import type { UserPackingDependencies } from '../user/user.js';
import { parseApiParams } from '../validation.js';
import { resolveApiDateIdPagination } from '../date-id-pagination.js';

export type ApiIDependencies = UserPackingDependencies & {
	db: MiDrizzleDatabase;
};

export const iSigninHistoryParamDef = z.object({
	limit: z.int().min(1).max(100).optional().default(10),
	...paginationParams,
});

export function packApiSignin(
	deps: ApiIDependencies,
	src: MiSignin,
): {
	id: string;
	createdAt: string;
	ip: string;
	headers: Record<string, unknown>;
	success: boolean;
} {
	return {
		id: src.id,
		createdAt: parseId(src.id).date.toISOString(),
		ip: src.ip,
		headers: src.headers,
		success: src.success,
	};
}

export async function handleApiI(
	deps: ApiIDependencies,
	user: MiLocalUser,
	token: MiAccessToken | null,
): Promise<Record<string, unknown>> {
	const now = new Date();
	const today = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;

	const [userProfile, freshUser] = await Promise.all([
		fetchUserProfileByUserIdFromDatabase(deps.db, user.id),
		fetchUserByIdOrFailFromDatabase(deps.db, user.id),
	]);

	if (userProfile == null) {
		throw userDeletedError();
	}

	if (!userProfile.loggedInDates.includes(today)) {
		userProfile.loggedInDates = [...userProfile.loggedInDates, today];
		await updateUserProfileInDatabase(deps.db, user.id, {
			loggedInDates: userProfile.loggedInDates,
		});
	}

	return await packMeDetailedForApi(deps, freshUser, {
		includeSecrets: token == null,
		profile: userProfile,
	});
}

export async function handleApiISigninHistory(
	deps: ApiIDependencies,
	user: MiLocalUser,
	params: ApiParams<typeof iSigninHistoryParamDef>,
): Promise<ReturnType<typeof packApiSignin>[]> {
	const { sinceId, untilId, order } = resolveApiDateIdPagination(params);

	const history = await listSigninHistoryFromDatabase(deps.db, user.id, {
		limit: params.limit,
		order,
		sinceId,
		untilId,
	});

	return history.map((record) => packApiSignin(deps, record));
}
