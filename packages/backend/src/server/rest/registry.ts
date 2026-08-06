/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
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

const registryScopeZodSchema = z.array(z.string().regex(/^[a-zA-Z0-9_]+$/)).default([]);

export const registryGetParamDef = z.object({
	key: z.string(),
	scope: registryScopeZodSchema,
	domain: z.string().nullable().optional(),
});

export const registryScopeParamDef = z.object({
	scope: registryScopeZodSchema,
	domain: z.string().nullable().optional(),
});

export const registrySetParamDef = z.object({
	key: z.string().min(1),
	value: z.unknown(),
	scope: registryScopeZodSchema,
	domain: z.string().nullable().optional(),
});

export const registryScopesWithDomainParamDef = z.object({});

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
	const item = await fetchRegistryItemFromDatabase(
		deps.db,
		user.id,
		registryDomain(token, params.domain),
		params.scope,
		params.key,
	);
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
	const items = await listRegistryItemsOfScopeFromDatabase(
		deps.db,
		user.id,
		registryDomain(token, params.domain),
		params.scope,
	);
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
	const item = await fetchRegistryItemFromDatabase(
		deps.db,
		user.id,
		registryDomain(token, params.domain),
		params.scope,
		params.key,
	);
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
	return await listRegistryKeysOfScopeFromDatabase(
		deps.db,
		user.id,
		registryDomain(token, params.domain),
		params.scope,
	);
}

export async function handleHonoApiRegistryKeysWithType(
	deps: HonoApiRegistryDependencies,
	user: MiLocalUser,
	token: MiAccessToken | null,
	body: Record<string, unknown>,
): Promise<Record<string, string>> {
	const params = parseHonoApiParams(registryScopeParamDef, body);
	const items = await listRegistryItemsOfScopeFromDatabase(
		deps.db,
		user.id,
		registryDomain(token, params.domain),
		params.scope,
	);
	const result: Record<string, string> = {};

	for (const item of items) {
		const type = typeof item.value;
		result[item.key] =
			item.value === null
				? 'null'
				: Array.isArray(item.value)
					? 'array'
					: type === 'number'
						? 'number'
						: type === 'string'
							? 'string'
							: type === 'boolean'
								? 'boolean'
								: type === 'object'
									? 'object'
									: (null as never);
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
	await deleteRegistryItemFromDatabase(
		deps.db,
		user.id,
		registryDomain(token, params.domain) || null,
		params.scope,
		params.key,
	);
}

export async function handleHonoApiRegistryScopesWithDomain(
	deps: HonoApiRegistryDependencies,
	user: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ domain: string | null; scopes: string[][] }[]> {
	parseHonoApiParams(registryScopesWithDomainParamDef, body);
	const items = await listRegistryScopeAndDomainsFromDatabase(deps.db, user.id);
	const result: { domain: string | null; scopes: string[][] }[] = [];
	const entryByDomain = new Map<string | null, { domain: string | null; scopes: string[][] }>();
	const scopeKeysByDomain = new Map<string | null, Set<string>>();

	for (const item of items) {
		let target = entryByDomain.get(item.domain);
		if (target == null) {
			target = {
				domain: item.domain,
				scopes: [],
			};
			entryByDomain.set(item.domain, target);
			scopeKeysByDomain.set(item.domain, new Set());
			result.push(target);
		}

		const scopeKey = item.scope.join('.');
		const scopeKeys = scopeKeysByDomain.get(item.domain)!;
		if (scopeKeys.has(scopeKey)) continue;
		scopeKeys.add(scopeKey);
		target.scopes.push(item.scope);
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
		id: genId(),
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
