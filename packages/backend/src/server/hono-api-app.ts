/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import { createAppInDatabase, fetchAppByIdFromDatabase, fetchAppByIdOrFailFromDatabase, listAppsByIdsFromDatabase, listAppsByUserIdFromDatabase } from '@/core/AppStore.js';
import {
	deleteAccessTokenByIdAndUserIdFromDatabase,
	deleteAccessTokenByTokenAndUserIdFromDatabase,
	existsAccessTokenByAppIdAndUserIdFromDatabase,
	existsAccessTokenByIdFromDatabase,
	existsAccessTokenByTokenFromDatabase,
	listAccessTokensByUserIdFromDatabase,
	listAccessTokensWithAppByUserIdFromDatabase,
	type AccessTokenOrderField,
} from '@/core/AccessTokenStore.js';
import type { AppRow } from '@/db/schema/app.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { Packed } from '@/misc/json-schema.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { unique } from '@/misc/prelude/array.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import type { MiUser } from '@/models/User.js';
import { HonoApiError } from './hono-api-error.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiAppDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
};

const appCreateParamDef = {
	type: 'object',
	properties: {
		name: { type: 'string' },
		description: { type: 'string' },
		permission: {
			type: 'array',
			uniqueItems: true,
			items: {
				type: 'string',
			},
		},
		callbackUrl: { type: 'string', nullable: true },
	},
	required: ['name', 'description', 'permission'],
} as const;

const appShowParamDef = {
	type: 'object',
	properties: {
		appId: { type: 'string', format: 'misskey:id' },
	},
	required: ['appId'],
} as const;

const myAppsParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		offset: { type: 'integer', default: 0 },
	},
	required: [],
} as const;

const iAppsParamDef = {
	type: 'object',
	properties: {
		sort: { type: 'string', enum: ['+createdAt', '-createdAt', '+lastUsedAt', '-lastUsedAt'] },
	},
	required: [],
} as const;

const iAuthorizedAppsParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		offset: { type: 'integer', default: 0 },
		sort: { type: 'string', enum: ['desc', 'asc'], default: 'desc' },
	},
	required: [],
} as const;

const iRevokeTokenParamDef = {
	anyOf: [
		{
			type: 'object',
			properties: {
				tokenId: { type: 'string', format: 'misskey:id' },
			},
			required: ['tokenId'],
		},
		{
			type: 'object',
			properties: {
				token: { type: 'string', nullable: true },
			},
			required: ['token'],
		},
	],
} as const;

type AppCreateParams = {
	name: string;
	description: string;
	permission: string[];
	callbackUrl?: string | null;
};

type AppShowParams = {
	appId: string;
};

type MyAppsParams = {
	limit: number;
	offset: number;
};

type IAppsParams = {
	sort?: '+createdAt' | '-createdAt' | '+lastUsedAt' | '-lastUsedAt';
};

type IAuthorizedAppsParams = {
	limit: number;
	offset: number;
	sort: 'desc' | 'asc';
};

type IRevokeTokenParams = {
	tokenId: string;
} | {
	token: string | null;
};

function noSuchAppError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such app.',
		code: 'NO_SUCH_APP',
		id: 'dce83913-2dc6-4093-8a7b-71dbb11718a3',
	});
}

export async function packHonoApiApp(
	deps: HonoApiAppDependencies,
	src: AppRow['id'] | AppRow,
	me?: { id: MiUser['id'] } | null | undefined,
	options?: {
		includeSecret?: boolean;
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
		...(me ? {
			isAuthorized: await existsAccessTokenByAppIdAndUserIdFromDatabase(deps.db, app.id, me.id),
		} : {}),
	};
}

export async function handleHonoApiAppCreate(
	deps: HonoApiAppDependencies,
	user: { id: MiUser['id'] } | null,
	body: Record<string, unknown>,
): Promise<Packed<'App'>> {
	const params = parseHonoApiParams(appCreateParamDef, body) as AppCreateParams;
	const secret = secureRndstr(32);
	const permission = unique(params.permission.map(v => v.replace(/^(.+)(\/|-)(read|write)$/, '$3:$1')));
	const app = await createAppInDatabase(deps.db, {
		id: genId(deps.config),
		userId: user ? user.id : null,
		name: params.name,
		description: params.description,
		permission,
		callbackUrl: params.callbackUrl,
		secret,
	});

	return await packHonoApiApp(deps, app, null, {
		includeSecret: true,
	});
}

export async function handleHonoApiAppShow(
	deps: HonoApiAppDependencies,
	user: { id: MiUser['id'] } | null,
	isSecureCredential: boolean,
	body: Record<string, unknown>,
): Promise<Packed<'App'>> {
	const params = parseHonoApiParams(appShowParamDef, body) as AppShowParams;
	const app = await fetchAppByIdFromDatabase(deps.db, params.appId);
	if (app == null) throw noSuchAppError();

	return await packHonoApiApp(deps, app, user, {
		includeSecret: isSecureCredential && app.userId === user?.id,
	});
}

export async function handleHonoApiMyApps(
	deps: HonoApiAppDependencies,
	user: { id: MiUser['id'] },
	body: Record<string, unknown>,
): Promise<Packed<'App'>[]> {
	const params = parseHonoApiParams(myAppsParamDef, body) as MyAppsParams;
	const apps = await listAppsByUserIdFromDatabase(deps.db, user.id, {
		limit: params.limit,
		offset: params.offset,
	});

	return await Promise.all(apps.map(app => packHonoApiApp(deps, app, user)));
}

export async function handleHonoApiIApps(
	deps: HonoApiAppDependencies,
	user: { id: MiUser['id'] },
	body: Record<string, unknown>,
): Promise<{
	id: string;
	name?: string;
	createdAt: string;
	lastUsedAt?: string;
	permission: string[];
	iconUrl?: string | null;
	description?: string | null;
}[]> {
	const params = parseHonoApiParams(iAppsParamDef, body) as IAppsParams;
	const field: AccessTokenOrderField = params.sort === '+lastUsedAt' || params.sort === '-lastUsedAt' ? 'lastUsedAt' : 'id';
	const direction = params.sort === '+createdAt' || params.sort === '+lastUsedAt' ? 'desc' : 'asc';
	const tokens = await listAccessTokensByUserIdFromDatabase(deps.db, user.id, { field, direction });
	const appIds = [...new Set(tokens.map(token => token.appId).filter((id): id is string => id != null))];
	const apps = await listAppsByIdsFromDatabase(deps.db, appIds);
	const appById = new Map(apps.map(app => [app.id, app]));

	return tokens.map(token => {
		const app = token.appId != null ? appById.get(token.appId) : undefined;

		return {
			id: token.id,
			name: token.name ?? app?.name,
			createdAt: parseId(deps.config, token.id).date.toISOString(),
			lastUsedAt: token.lastUsedAt?.toISOString(),
			permission: app ? app.permission : token.permission,
			iconUrl: token.iconUrl,
			description: token.description ?? app?.description ?? null,
		};
	});
}

export async function handleHonoApiIAuthorizedApps(
	deps: HonoApiAppDependencies,
	user: { id: MiUser['id'] },
	body: Record<string, unknown>,
): Promise<Packed<'App'>[]> {
	const params = parseHonoApiParams(iAuthorizedAppsParamDef, body) as IAuthorizedAppsParams;
	const tokens = await listAccessTokensWithAppByUserIdFromDatabase(deps.db, user.id, {
		limit: params.limit,
		offset: params.offset,
		direction: params.sort === 'asc' ? 'asc' : 'desc',
	});
	const appIds = tokens.map(token => token.appId).filter((id): id is string => id != null);
	const apps = await listAppsByIdsFromDatabase(deps.db, [...new Set(appIds)]);
	const appById = new Map(apps.map(app => [app.id, app]));

	return tokens.map(token => {
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

export async function handleHonoApiIRevokeToken(
	deps: HonoApiAppDependencies,
	user: { id: MiUser['id'] },
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(iRevokeTokenParamDef, body) as IRevokeTokenParams;

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
