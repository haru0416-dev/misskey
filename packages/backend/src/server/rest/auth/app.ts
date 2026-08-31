/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { omitUndefined } from '@/misc/clone.js';
import type { Config } from '@/config.js';
import {
	createAppInDatabase,
	fetchAppByIdFromDatabase,
	fetchAppByIdOrFailFromDatabase,
	listAppsByIdsFromDatabase,
	listAppsByUserIdFromDatabase,
} from '@/core/app/AppStore.js';
import {
	deleteAccessTokenByIdAndUserIdFromDatabase,
	deleteAccessTokenByTokenAndUserIdFromDatabase,
	existsAccessTokenByAppIdAndUserIdFromDatabase,
	existsAccessTokenByIdFromDatabase,
	existsAccessTokenByTokenFromDatabase,
	listAccessTokensByUserIdFromDatabase,
	listAccessTokensWithAppByUserIdFromDatabase,
	listAuthorizedAppIdsByUserIdAndAppIdsFromDatabase,
	type AccessTokenOrderField,
} from '@/core/app/AccessTokenStore.js';
import type { AppRow } from '@/db/schema/app.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { Packed } from '@/misc/json-schema.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { unique } from '@/misc/prelude/array.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import { misskeyId, uniqueItems } from '@/misc/zod-params.js';
import type { MiUser } from '@/models/User.js';
import { ApiError } from '../error.js';
import { parseApiParams } from '../validation.js';

export type ApiAppDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
};

export const appCreateParamDef = z.object({
	name: z.string(),
	description: z.string(),
	permission: uniqueItems(z.array(z.string())),
	callbackUrl: z.string().nullable().optional(),
});

export const appShowParamDef = z.object({
	appId: misskeyId(),
});

export const myAppsParamDef = z.object({
	limit: z.int().min(1).max(100).default(10),
	offset: z.int().nonnegative().default(0),
});

export const iAppsParamDef = z.object({
	sort: z.enum(['+createdAt', '-createdAt', '+lastUsedAt', '-lastUsedAt']).optional(),
});

export const iAuthorizedAppsParamDef = z.object({
	limit: z.int().min(1).max(100).default(10),
	offset: z.int().nonnegative().default(0),
	sort: z.enum(['desc', 'asc']).default('desc'),
});

// tokenId と token は互いに素なため、各分岐の型検査が他方へ影響しない z.union() で表す。
export const iRevokeTokenParamDef = z.union([
	z.object({ tokenId: misskeyId() }),
	z.object({ token: z.string().nullable() }),
]);

function noSuchAppError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such app.',
		code: 'NO_SUCH_APP',
		id: 'dce83913-2dc6-4093-8a7b-71dbb11718a3',
	});
}

export async function packApiApp(
	deps: ApiAppDependencies,
	src: AppRow['id'] | AppRow,
	me?: { id: MiUser['id'] } | null | undefined,
	options?: {
		includeSecret?: boolean;
		isAuthorized?: boolean;
	},
): Promise<Packed<'App'>> {
	const opts = {
		includeSecret: false,
		...options,
	};
	const app = typeof src === 'object' ? src : await fetchAppByIdOrFailFromDatabase(deps.db, src);

	return {
		id: app.id,
		name: app.name,
		callbackUrl: app.callbackUrl,
		permission: app.permission,
		...(opts.includeSecret ? { secret: app.secret } : {}),
		...(me
			? {
					isAuthorized:
						opts.isAuthorized ?? (await existsAccessTokenByAppIdAndUserIdFromDatabase(deps.db, app.id, me.id)),
				}
			: {}),
	};
}

export async function handleApiAppCreate(
	deps: ApiAppDependencies,
	user: { id: MiUser['id'] } | null,
	body: Record<string, unknown>,
): Promise<Packed<'App'>> {
	const params = parseApiParams(appCreateParamDef, body);
	const secret = secureRndstr(32);
	const permission = unique(params.permission.map((v) => v.replace(/^(.+)(\/|-)(read|write)$/, '$3:$1')));
	const app = await createAppInDatabase(deps.db, {
		id: genId(),
		userId: user ? user.id : null,
		name: params.name,
		description: params.description,
		permission,
		callbackUrl: params.callbackUrl,
		secret,
	});

	return await packApiApp(deps, app, null, {
		includeSecret: true,
	});
}

export async function handleApiAppShow(
	deps: ApiAppDependencies,
	user: { id: MiUser['id'] } | null,
	isSecureCredential: boolean,
	body: Record<string, unknown>,
): Promise<Packed<'App'>> {
	const params = parseApiParams(appShowParamDef, body);
	const app = await fetchAppByIdFromDatabase(deps.db, params.appId);
	if (app == null) throw noSuchAppError();

	return await packApiApp(deps, app, user, {
		includeSecret: isSecureCredential && app.userId === user?.id,
	});
}

export async function handleApiMyApps(
	deps: ApiAppDependencies,
	user: { id: MiUser['id'] },
	body: Record<string, unknown>,
): Promise<Packed<'App'>[]> {
	const params = parseApiParams(myAppsParamDef, body);
	const apps = await listAppsByUserIdFromDatabase(deps.db, user.id, {
		limit: params.limit,
		offset: params.offset,
	});
	const authorizedAppIds = new Set(
		await listAuthorizedAppIdsByUserIdAndAppIdsFromDatabase(
			deps.db,
			user.id,
			apps.map((app) => app.id),
		),
	);

	return await Promise.all(
		apps.map((app) =>
			packApiApp(deps, app, user, {
				isAuthorized: authorizedAppIds.has(app.id),
			}),
		),
	);
}

export async function handleApiIApps(
	deps: ApiAppDependencies,
	user: { id: MiUser['id'] },
	body: Record<string, unknown>,
): Promise<
	{
		id: string;
		name?: string;
		createdAt: string;
		lastUsedAt?: string;
		permission: string[];
		iconUrl?: string | null;
		description?: string | null;
	}[]
> {
	const params = parseApiParams(iAppsParamDef, body);
	const field: AccessTokenOrderField =
		params.sort === '+lastUsedAt' || params.sort === '-lastUsedAt' ? 'lastUsedAt' : 'id';
	const direction = params.sort === '+createdAt' || params.sort === '+lastUsedAt' ? 'desc' : 'asc';
	const tokens = await listAccessTokensByUserIdFromDatabase(deps.db, user.id, { field, direction });
	const appIds = [...new Set(tokens.map((token) => token.appId).filter((id): id is string => id != null))];
	const apps = await listAppsByIdsFromDatabase(deps.db, appIds);
	const appById = new Map(apps.map((app) => [app.id, app]));

	return tokens.map((token) => {
		const app = token.appId != null ? appById.get(token.appId) : undefined;

		return omitUndefined({
			id: token.id,
			name: token.name ?? app?.name,
			createdAt: parseId(token.id).date.toISOString(),
			lastUsedAt: token.lastUsedAt?.toISOString(),
			permission: app ? app.permission : token.permission,
			iconUrl: token.iconUrl,
			description: token.description ?? app?.description ?? null,
		});
	});
}

export async function handleApiIAuthorizedApps(
	deps: ApiAppDependencies,
	user: { id: MiUser['id'] },
	body: Record<string, unknown>,
): Promise<Packed<'App'>[]> {
	const params = parseApiParams(iAuthorizedAppsParamDef, body);
	const tokens = await listAccessTokensWithAppByUserIdFromDatabase(deps.db, user.id, {
		limit: params.limit,
		offset: params.offset,
		direction: params.sort === 'asc' ? 'asc' : 'desc',
	});
	const appIds = tokens.map((token) => token.appId).filter((id): id is string => id != null);
	const apps = await listAppsByIdsFromDatabase(deps.db, [...new Set(appIds)]);
	const appById = new Map(apps.map((app) => [app.id, app]));

	return tokens.map((token) => {
		const app = token.appId != null ? appById.get(token.appId) : undefined;
		if (app == null) throw new Error(`App ${token.appId} not found`);

		return {
			id: app.id,
			name: app.name,
			callbackUrl: app.callbackUrl,
			permission: app.permission,
			isAuthorized: true,
		};
	});
}

export async function handleApiIRevokeToken(
	deps: ApiAppDependencies,
	user: { id: MiUser['id'] },
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(iRevokeTokenParamDef, body);

	if ('tokenId' in params) {
		const tokenExists = await existsAccessTokenByIdFromDatabase(deps.db, params.tokenId);
		if (tokenExists) {
			await deleteAccessTokenByIdAndUserIdFromDatabase(deps.db, params.tokenId, user.id);
		}
	} else if (params.token) {
		const tokenExists = await existsAccessTokenByTokenFromDatabase(deps.db, params.token);
		if (tokenExists) {
			await deleteAccessTokenByTokenAndUserIdFromDatabase(deps.db, params.token, user.id);
		}
	}
}
