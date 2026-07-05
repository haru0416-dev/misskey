/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import { fetchUserProfileByUserIdFromDatabase, updateUserProfileInDatabase } from '@/core/UserProfileStore.js';
import { listSigninHistoryFromDatabase, type SigninHistoryOrder } from '@/core/SigninStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { SchemaType } from '@/misc/json-schema.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type { MiSignin } from '@/models/Signin.js';
import type { MiLocalUser } from '@/models/User.js';
import { userDeletedError } from './error.js';
import { packMeDetailedForHonoApi, type UserPackingDependencies } from './user.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiIDependencies = UserPackingDependencies & {
	db: MiDrizzleDatabase;
};

const iSigninHistoryParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: [],
} as const;

type ISigninHistoryParams = SchemaType<typeof iSigninHistoryParamDef>;

export function packHonoApiSignin(
	deps: HonoApiIDependencies,
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
		createdAt: parseId(deps.config, src.id).date.toISOString(),
		ip: src.ip,
		headers: src.headers,
		success: src.success,
	};
}

export async function handleHonoApiI(
	deps: HonoApiIDependencies,
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

	return await packMeDetailedForHonoApi(deps, freshUser, {
		includeSecrets: token == null,
		profile: userProfile,
	});
}

export async function handleHonoApiISigninHistory(
	deps: HonoApiIDependencies,
	user: MiLocalUser,
	body: Record<string, unknown>,
): Promise<ReturnType<typeof packHonoApiSignin>[]> {
	const params = parseHonoApiParams(iSigninHistoryParamDef, body) as ISigninHistoryParams;
	let sinceId: string | null = null;
	let untilId: string | null = null;
	let order: SigninHistoryOrder = 'desc';

	if (params.sinceId && params.untilId) {
		sinceId = params.sinceId;
		untilId = params.untilId;
	} else if (params.sinceId) {
		sinceId = params.sinceId;
		order = 'asc';
	} else if (params.untilId) {
		untilId = params.untilId;
	} else if (params.sinceDate && params.untilDate) {
		sinceId = genId(deps.config, params.sinceDate);
		untilId = genId(deps.config, params.untilDate);
	} else if (params.sinceDate) {
		sinceId = genId(deps.config, params.sinceDate);
		order = 'asc';
	} else if (params.untilDate) {
		untilId = genId(deps.config, params.untilDate);
	}

	const history = await listSigninHistoryFromDatabase(deps.db, user.id, {
		limit: params.limit,
		order,
		sinceId,
		untilId,
	});

	return history.map(record => packHonoApiSignin(deps, record));
}
