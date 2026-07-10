/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, desc, eq, inArray } from 'drizzle-orm';
import { role, type RoleInsert, type RoleRow } from '@/db/schema/role.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import type { MiRole } from '@/models/Role.js';

export type RoleSummary = Pick<MiRole, 'id' | 'name' | 'displayOrder'>;
export type RoleUpdate = Partial<Omit<RoleInsert, 'id'>>;

function deserializeRole(row: RoleRow): MiRole {
	return row as MiRole;
}

export async function listRolesFromDatabase(
	db: MiDrizzleDatabase,
): Promise<MiRole[]> {
	const rows = await db
		.select()
		.from(role);

	return rows.map(row => deserializeRole(row));
}

export async function listRolesOrderByLastUsedAtDescFromDatabase(
	db: MiDrizzleDatabase,
): Promise<MiRole[]> {
	const rows = await db
		.select()
		.from(role)
		.orderBy(desc(role.lastUsedAt));

	return rows.map(row => deserializeRole(row));
}

export async function listRolesByIdsFromDatabase(
	db: MiDrizzleDatabase,
	ids: MiRole['id'][],
): Promise<MiRole[]> {
	if (ids.length === 0) return [];

	const rows = await db
		.select()
		.from(role)
		.where(inArray(role.id, ids));

	return rows.map(row => deserializeRole(row));
}

export async function listPublicExplorableRolesFromDatabase(
	db: MiDrizzleDatabase,
): Promise<MiRole[]> {
	const rows = await db
		.select()
		.from(role)
		.where(and(
			eq(role.isPublic, true),
			eq(role.isExplorable, true),
		));

	return rows.map(row => deserializeRole(row));
}

export async function fetchRoleByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiRole['id'],
): Promise<MiRole | null> {
	const [row] = await db
		.select()
		.from(role)
		.where(eq(role.id, id))
		.limit(1);

	return row == null ? null : deserializeRole(row);
}

export async function fetchRoleByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: MiRole['id'],
): Promise<MiRole> {
	const row = await fetchRoleByIdFromDatabase(db, id);

	if (row == null) {
		throw new EntityNotFoundError('MiRole', { id });
	}

	return row;
}

export async function fetchPublicRoleByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiRole['id'],
): Promise<MiRole | null> {
	const [row] = await db
		.select()
		.from(role)
		.where(and(
			eq(role.id, id),
			eq(role.isPublic, true),
		))
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
		.where(and(
			eq(role.id, id),
			eq(role.isPublic, true),
			eq(role.isExplorable, true),
		))
		.limit(1);

	return row == null ? null : deserializeRole(row);
}

export async function listRoleSummariesByIdsFromDatabase(
	db: MiDrizzleDatabase,
	ids: MiRole['id'][],
): Promise<RoleSummary[]> {
	if (ids.length === 0) return [];

	return await db
		.select({
			id: role.id,
			name: role.name,
			displayOrder: role.displayOrder,
		})
		.from(role)
		.where(inArray(role.id, ids));
}

export async function createRoleInDatabase(
	db: MiDrizzleDatabase,
	values: RoleInsert,
): Promise<MiRole> {
	const [row] = await db
		.insert(role)
		.values(values)
		.returning();

	if (row == null) {
		throw new Error('Failed to create role');
	}

	return deserializeRole(row);
}

export async function updateRoleInDatabase(
	db: MiDrizzleDatabase,
	id: MiRole['id'],
	values: RoleUpdate,
): Promise<void> {
	await db
		.update(role)
		.set(values)
		.where(eq(role.id, id));
}

export async function deleteRoleInDatabase(
	db: MiDrizzleDatabase,
	id: MiRole['id'],
): Promise<void> {
	await db
		.delete(role)
		.where(eq(role.id, id));
}
