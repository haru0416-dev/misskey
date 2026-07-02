/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, eq, isNull } from 'drizzle-orm';
import { registryItem, type RegistryItemRow } from '@/db/schema/registry-item.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiRegistryItem } from '@/models/RegistryItem.js';
import type { MiUser } from '@/models/User.js';

type RegistryItemSet = Pick<MiRegistryItem, 'id' | 'updatedAt' | 'userId' | 'domain' | 'scope' | 'key' | 'value'>;

function deserializeRegistryItem(row: RegistryItemRow): MiRegistryItem {
	return {
		...row,
		user: null,
	} as MiRegistryItem;
}

function registryItemCondition(userId: MiUser['id'], domain: string | null, scope: string[], key?: string) {
	return and(
		domain == null ? isNull(registryItem.domain) : eq(registryItem.domain, domain),
		eq(registryItem.userId, userId),
		eq(registryItem.scope, scope),
		key == null ? undefined : eq(registryItem.key, key),
	);
}

export async function setRegistryItemInDatabase(
	db: MiDrizzleDatabase,
	data: RegistryItemSet,
): Promise<void> {
	const [existingItem] = await db
		.select({ id: registryItem.id })
		.from(registryItem)
		.where(registryItemCondition(data.userId, data.domain ?? null, data.scope, data.key))
		.limit(1);

	if (existingItem) {
		await db
			.update(registryItem)
			.set({
				updatedAt: data.updatedAt,
				value: data.value,
			})
			.where(eq(registryItem.id, existingItem.id));
	} else {
		await db
			.insert(registryItem)
			.values(data);
	}
}

export async function fetchRegistryItemFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	domain: string | null,
	scope: string[],
	key: string,
): Promise<MiRegistryItem | null> {
	const [row] = await db
		.select()
		.from(registryItem)
		.where(registryItemCondition(userId, domain, scope, key))
		.limit(1);

	return row ? deserializeRegistryItem(row) : null;
}

export async function listRegistryItemsOfScopeFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	domain: string | null,
	scope: string[],
): Promise<MiRegistryItem[]> {
	const rows = await db
		.select()
		.from(registryItem)
		.where(registryItemCondition(userId, domain, scope));

	return rows.map(deserializeRegistryItem);
}

export async function listRegistryKeysOfScopeFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	domain: string | null,
	scope: string[],
): Promise<string[]> {
	const rows = await db
		.select({ key: registryItem.key })
		.from(registryItem)
		.where(registryItemCondition(userId, domain, scope));

	return rows.map(row => row.key);
}

export async function listRegistryScopeAndDomainsFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<Pick<MiRegistryItem, 'scope' | 'domain'>[]> {
	return db
		.select({
			scope: registryItem.scope,
			domain: registryItem.domain,
		})
		.from(registryItem)
		.where(eq(registryItem.userId, userId));
}

export async function deleteRegistryItemFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	domain: string | null,
	scope: string[],
	key: string,
): Promise<void> {
	await db
		.delete(registryItem)
		.where(registryItemCondition(userId, domain, scope, key));
}
