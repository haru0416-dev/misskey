/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, desc, eq, inArray, getTableColumns, getTableName } from 'drizzle-orm';
import { defineQueryPlan } from '@/db/prepared.js';
import { cacheVersion } from '@/db/schema/cache-version.js';
import { role } from '@/db/schema/role.js';
import type { RoleInsert, RoleRow } from '@/db/schema/role.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import type { MiRole } from '@/models/Role.js';

export type RoleSummary = Pick<MiRole, 'id' | 'name' | 'displayOrder'>;
export type RoleUpdate = Partial<Omit<RoleInsert, 'id'>>;

function deserializeRole(row: RoleRow): MiRole {
	return row as MiRole;
}

const roleAllPlan = defineQueryPlan((db) => {
	const selection = getTableColumns(role);
	return {
		query: db.select(selection).from(role),
		selection,
		metadata: { type: 'select', tables: [getTableName(role)] },
	};
});

export async function listRolesFromDatabase(db: MiDrizzleDatabase): Promise<MiRole[]> {
	const rows = await roleAllPlan.execute(db);

	return rows.map((row) => deserializeRole(row));
}

const cacheVersionRolesPlan = defineQueryPlan((db) => {
	const selection = { version: cacheVersion.version };
	return {
		query: db.select(selection).from(cacheVersion).where(eq(cacheVersion.key, 'roles')),
		selection,
		metadata: { type: 'select', tables: [getTableName(cacheVersion)] },
	};
});

/**
 * role / role_assignment の世代番号。両テーブルのトリガが書き込みのたびに進める (migration 0016)。
 * 書き込みが API 経由でも Store 関数直呼びでも生 SQL でも進むので、プロセスをまたぐキャッシュの
 * 新旧判定に使える。認証クエリが同じ値を副問い合わせで一緒に返すため、通常のリクエストでは
 * この関数は呼ばれない。
 */
export async function fetchRolesCacheVersionFromDatabase(db: MiDrizzleDatabase): Promise<number> {
	const [row] = await cacheVersionRolesPlan.execute(db);
	return row?.version ?? 0;
}

let rolesByVersion: { version: number; roles: readonly MiRole[] } | null = null;

/**
 * 全ロール定義を世代番号付きで使い回す。全認証リクエストが通る経路なので、世代が同じ間は DB を読まない。
 * 返す配列と要素は共有物なので凍結する。書き換えが要る呼び出し側は listRolesFromDatabase を使うこと。
 */
export async function listRolesFromDatabaseCachedByVersion(
	db: MiDrizzleDatabase,
	version: number,
): Promise<readonly MiRole[]> {
	if (rolesByVersion?.version === version) {
		return rolesByVersion.roles;
	}

	const roles = await listRolesFromDatabase(db);
	for (const entry of roles) {
		Object.freeze(entry);
	}
	Object.freeze(roles);
	rolesByVersion = { version, roles };

	return roles;
}

export async function listRolesOrderByLastUsedAtDescFromDatabase(db: MiDrizzleDatabase): Promise<MiRole[]> {
	const rows = await db.select().from(role).orderBy(desc(role.lastUsedAt));

	return rows.map((row) => deserializeRole(row));
}

export async function listRolesByIdsFromDatabase(db: MiDrizzleDatabase, ids: MiRole['id'][]): Promise<MiRole[]> {
	if (ids.length === 0) {
		return [];
	}

	const rows = await db.select().from(role).where(inArray(role.id, ids));

	return rows.map((row) => deserializeRole(row));
}

export async function listPublicExplorableRolesFromDatabase(db: MiDrizzleDatabase): Promise<MiRole[]> {
	const rows = await db
		.select()
		.from(role)
		.where(and(eq(role.isPublic, true), eq(role.isExplorable, true)));

	return rows.map((row) => deserializeRole(row));
}

export async function fetchRoleByIdFromDatabase(db: MiDrizzleDatabase, id: MiRole['id']): Promise<MiRole | null> {
	const [row] = await db.select().from(role).where(eq(role.id, id)).limit(1);

	return row == null ? null : deserializeRole(row);
}

export async function fetchRoleByIdOrFailFromDatabase(db: MiDrizzleDatabase, id: MiRole['id']): Promise<MiRole> {
	const row = await fetchRoleByIdFromDatabase(db, id);

	if (row == null) {
		throw new EntityNotFoundError('MiRole', { id });
	}

	return row;
}

export async function fetchPublicRoleByIdFromDatabase(db: MiDrizzleDatabase, id: MiRole['id']): Promise<MiRole | null> {
	const [row] = await db
		.select()
		.from(role)
		.where(and(eq(role.id, id), eq(role.isPublic, true)))
		.limit(1);

	return row == null ? null : deserializeRole(row);
}

export async function fetchPublicExplorableRoleByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiRole['id'],
): Promise<MiRole | null> {
	const [row] = await db
		.select()
		.from(role)
		.where(and(eq(role.id, id), eq(role.isPublic, true), eq(role.isExplorable, true)))
		.limit(1);

	return row == null ? null : deserializeRole(row);
}

export async function listRoleSummariesByIdsFromDatabase(
	db: MiDrizzleDatabase,
	ids: MiRole['id'][],
): Promise<RoleSummary[]> {
	if (ids.length === 0) {
		return [];
	}

	return await db
		.select({
			id: role.id,
			name: role.name,
			displayOrder: role.displayOrder,
		})
		.from(role)
		.where(inArray(role.id, ids));
}

export async function createRoleInDatabase(db: MiDrizzleDatabase, values: RoleInsert): Promise<MiRole> {
	const [row] = await db.insert(role).values(values).returning();

	if (row == null) {
		throw new Error('Failed to create role');
	}

	return deserializeRole(row);
}

export async function updateRoleInDatabase(db: MiDrizzleDatabase, id: MiRole['id'], values: RoleUpdate): Promise<void> {
	await db.update(role).set(values).where(eq(role.id, id));
}

export async function deleteRoleInDatabase(db: MiDrizzleDatabase, id: MiRole['id']): Promise<void> {
	await db.delete(role).where(eq(role.id, id));
}
