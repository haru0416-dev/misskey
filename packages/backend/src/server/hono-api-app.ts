/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import { createAppInDatabase, fetchAppByIdFromDatabase, fetchAppByIdOrFailFromDatabase, listAppsByUserIdFromDatabase } from '@/core/AppStore.js';
import { existsAccessTokenByAppIdAndUserIdFromDatabase } from '@/core/AccessTokenStore.js';
import type { AppRow } from '@/db/schema/app.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { Packed } from '@/misc/json-schema.js';
import { genId } from '@/misc/id/gen-id.js';
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
