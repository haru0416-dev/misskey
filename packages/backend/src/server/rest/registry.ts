/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import {
	deleteRegistryItemFromDatabase,
	fetchRegistryItemFromDatabase,
	listRegistryItemsOfScopeFromDatabase,
	listRegistryKeysOfScopeFromDatabase,
	listRegistryScopeAndDomainsFromDatabase,
	setRegistryItemInDatabase,
} from '@/core/RegistryItemStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import type { SchemaType } from '@/misc/json-schema.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { HonoApiError } from './error.js';
import type { HonoApiMainStreamPublisher } from './notification.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiRegistryDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	publishMainStream?: HonoApiMainStreamPublisher;
};

const registryScopeSchema = {
	type: 'array',
	default: [],
	items: {
		type: 'string',
		pattern: /^[a-zA-Z0-9_]+$/.toString().slice(1, -1),
	},
} as const;

const registryGetParamDef = {
	type: 'object',
	properties: {
		key: { type: 'string' },
		scope: registryScopeSchema,
		domain: { type: 'string', nullable: true },
	},
	required: ['key', 'scope'],
} as const;

const registryScopeParamDef = {
	type: 'object',
	properties: {
		scope: registryScopeSchema,
		domain: { type: 'string', nullable: true },
	},
	required: ['scope'],
} as const;

const registrySetParamDef = {
	type: 'object',
	properties: {
		key: { type: 'string', minLength: 1 },
		value: {},
		scope: registryScopeSchema,
		domain: { type: 'string', nullable: true },
	},
	required: ['key', 'value', 'scope'],
} as const;

const registryScopesWithDomainParamDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

type RegistrySetParams = {
	key: string;
	value: unknown;
	scope: string[];
	domain?: string | null;
};

function noSuchGetKeyError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such key.',
		code: 'NO_SUCH_KEY',
		id: 'ac3ed68a-62f0-422b-a7bc-d5e09e8f6a6a',
	});
}

function noSuchGetDetailKeyError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such key.',
		code: 'NO_SUCH_KEY',
		id: '97a1e8e7-c0f7-47d2-957a-92e61256e01a',
	});
}

function registryDomain(token: MiAccessToken | null, bodyDomain: string | null | undefined): string | null {
	return token != null ? token.id : (bodyDomain ?? null);
}

export async function handleHonoApiRegistryGet(
	deps: HonoApiRegistryDependencies,
	user: MiLocalUser,
	token: MiAccessToken | null,
	body: Record<string, unknown>,
): Promise<unknown> {
	const params = parseHonoApiParams(registryGetParamDef, body);
	const item = await fetchRegistryItemFromDatabase(deps.db, user.id, registryDomain(token, params.domain), params.scope, params.key);
	if (item == null) throw noSuchGetKeyError();

	return item.value;
}

export async function handleHonoApiRegistryGetAll(
	deps: HonoApiRegistryDependencies,
	user: MiLocalUser,
	token: MiAccessToken | null,
	body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const params = parseHonoApiParams(registryScopeParamDef, body);
	const items = await listRegistryItemsOfScopeFromDatabase(deps.db, user.id, registryDomain(token, params.domain), params.scope);
	const result: Record<string, unknown> = {};

	for (const item of items) {
		result[item.key] = item.value;
	}

	return result;
}

export async function handleHonoApiRegistryGetDetail(
	deps: HonoApiRegistryDependencies,
	user: MiLocalUser,
	token: MiAccessToken | null,
	body: Record<string, unknown>,
): Promise<{
	updatedAt: string;
	value: unknown;
}> {
	const params = parseHonoApiParams(registryGetParamDef, body);
	const item = await fetchRegistryItemFromDatabase(deps.db, user.id, registryDomain(token, params.domain), params.scope, params.key);
	if (item == null) throw noSuchGetDetailKeyError();

	return {
		updatedAt: item.updatedAt.toISOString(),
		value: item.value,
	};
}

export async function handleHonoApiRegistryKeys(
	deps: HonoApiRegistryDependencies,
	user: MiLocalUser,
	token: MiAccessToken | null,
	body: Record<string, unknown>,
): Promise<string[]> {
	const params = parseHonoApiParams(registryScopeParamDef, body);
	return await listRegistryKeysOfScopeFromDatabase(deps.db, user.id, registryDomain(token, params.domain), params.scope);
}

export async function handleHonoApiRegistryKeysWithType(
	deps: HonoApiRegistryDependencies,
	user: MiLocalUser,
	token: MiAccessToken | null,
	body: Record<string, unknown>,
): Promise<Record<string, string>> {
	const params = parseHonoApiParams(registryScopeParamDef, body);
	const items = await listRegistryItemsOfScopeFromDatabase(deps.db, user.id, registryDomain(token, params.domain), params.scope);
	const result: Record<string, string> = {};

	for (const item of items) {
		const type = typeof item.value;
		result[item.key] =
			item.value === null ? 'null' :
			Array.isArray(item.value) ? 'array' :
			type === 'number' ? 'number' :
			type === 'string' ? 'string' :
			type === 'boolean' ? 'boolean' :
			type === 'object' ? 'object' :
			null as never;
	}

	return result;
}

export async function handleHonoApiRegistryRemove(
	deps: HonoApiRegistryDependencies,
	user: MiLocalUser,
	token: MiAccessToken | null,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(registryGetParamDef, body);
	await deleteRegistryItemFromDatabase(deps.db, user.id, registryDomain(token, params.domain) || null, params.scope, params.key);
}

export async function handleHonoApiRegistryScopesWithDomain(
	deps: HonoApiRegistryDependencies,
	user: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ domain: string | null; scopes: string[][] }[]> {
	parseHonoApiParams(registryScopesWithDomainParamDef, body);
	const items = await listRegistryScopeAndDomainsFromDatabase(deps.db, user.id);
	const result: { domain: string | null; scopes: string[][] }[] = [];

	for (const item of items) {
		const target = result.find(entry => entry.domain === item.domain);
		if (target) {
			if (target.scopes.some(scope => scope.join('.') === item.scope.join('.'))) continue;
			target.scopes.push(item.scope);
		} else {
			result.push({
				domain: item.domain,
				scopes: [item.scope],
			});
		}
	}

	return result;
}

export async function handleHonoApiRegistrySet(
	deps: HonoApiRegistryDependencies,
	user: MiLocalUser,
	token: MiAccessToken | null,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(registrySetParamDef, body);
	const domain = registryDomain(token, params.domain);
	const itemDomain = domain || null;

	await setRegistryItemInDatabase(deps.db, {
		id: genId(deps.config),
		updatedAt: new Date(),
		userId: user.id as MiUser['id'],
		domain: itemDomain,
		scope: params.scope,
		key: params.key,
		value: params.value,
	});

	if (domain == null) {
		deps.publishMainStream?.(user.id, 'registryUpdated', {
			scope: params.scope,
			key: params.key,
			value: params.value,
		});
	}
}
