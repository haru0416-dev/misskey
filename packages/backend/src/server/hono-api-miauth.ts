/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createAccessTokenInDatabase } from '@/core/AccessTokenStore.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import type { MiLocalUser } from '@/models/User.js';
import { invalidParamError } from './hono-api-error.js';
import { createTokenNotification, type HonoApiNotificationDependencies } from './hono-api-notification.js';

export type HonoApiMiauthDependencies = HonoApiNotificationDependencies & {
	config: Config;
	db: MiDrizzleDatabase;
};

type MiauthGenTokenBody = {
	session: string | null;
	name?: string | null;
	description?: string | null;
	iconUrl?: string | null;
	permission: string[];
};

function assertNullableString(value: unknown, name: string): asserts value is string | null {
	if (value !== null && typeof value !== 'string') {
		throw invalidParamError({ param: name, reason: 'must be string or null' });
	}
}

function assertOptionalNullableString(value: unknown, name: string): asserts value is string | null | undefined {
	if (value !== undefined) {
		assertNullableString(value, name);
	}
}

function parseMiauthGenTokenBody(body: Record<string, unknown>): MiauthGenTokenBody {
	if (!Object.hasOwn(body, 'session')) {
		throw invalidParamError({ param: '/required', reason: 'must have required property session' });
	}

	if (!Object.hasOwn(body, 'permission')) {
		throw invalidParamError({ param: '/required', reason: 'must have required property permission' });
	}

	assertNullableString(body.session, '/properties/session');
	assertOptionalNullableString(body.name, '/properties/name');
	assertOptionalNullableString(body.description, '/properties/description');
	assertOptionalNullableString(body.iconUrl, '/properties/iconUrl');

	if (!Array.isArray(body.permission) || body.permission.some(permission => typeof permission !== 'string')) {
		throw invalidParamError({ param: '/properties/permission', reason: 'must be array of strings' });
	}

	if (new Set(body.permission).size !== body.permission.length) {
		throw invalidParamError({ param: '/properties/permission/uniqueItems', reason: 'must NOT have duplicate items' });
	}

	return {
		session: body.session,
		name: body.name,
		description: body.description,
		iconUrl: body.iconUrl,
		permission: body.permission,
	};
}

export async function handleHonoApiMiauthGenToken(
	deps: HonoApiMiauthDependencies,
	user: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ token: string }> {
	const params = parseMiauthGenTokenBody(body);
	const accessToken = secureRndstr(32);
	const now = new Date();

	await createAccessTokenInDatabase(deps.db, {
		id: genId(deps.config, now.getTime()),
		lastUsedAt: now,
		session: params.session,
		userId: user.id,
		token: accessToken,
		hash: accessToken,
		name: params.name,
		description: params.description,
		iconUrl: params.iconUrl,
		permission: params.permission,
	});

	createTokenNotification(deps, user.id);

	return {
		token: accessToken,
	};
}
