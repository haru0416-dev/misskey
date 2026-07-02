/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, count, eq, inArray, lt, sql } from 'drizzle-orm';
import { antenna, type AntennaInsert, type AntennaRow } from '@/db/schema/antenna.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import { MiAntenna } from '@/models/Antenna.js';
import type { MiUser } from '@/models/User.js';

function deserializeAntenna(row: AntennaRow): MiAntenna {
	return {
		...row,
		user: null, // joinなカラムは通常取ってこないので
		userList: null, // joinなカラムは通常取ってこないので
	} as MiAntenna;
}

export async function countAntennasByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<number> {
	const [row] = await db
		.select({ count: count() })
		.from(antenna)
		.where(eq(antenna.userId, userId));

	return row?.count ?? 0;
}

export async function createAntennaInDatabase(
	db: MiDrizzleDatabase,
	data: AntennaInsert,
): Promise<MiAntenna> {
	const [row] = await db
		.insert(antenna)
		.values(data)
		.returning();

	if (row == null) {
		throw new Error('Failed to create antenna');
	}

	return deserializeAntenna(row);
}

export async function updateAntennaInDatabase(
	db: MiDrizzleDatabase,
	id: MiAntenna['id'],
	values: Partial<AntennaInsert>,
): Promise<void> {
	await db
		.update(antenna)
		.set(values)
		.where(eq(antenna.id, id));
}

export async function deleteAntennaFromDatabase(
	db: MiDrizzleDatabase,
	id: MiAntenna['id'],
): Promise<void> {
	await db
		.delete(antenna)
		.where(eq(antenna.id, id));
}

export async function fetchAntennaByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiAntenna['id'],
): Promise<MiAntenna | null> {
	const [row] = await db
		.select()
		.from(antenna)
		.where(eq(antenna.id, id))
		.limit(1);

	return row ? deserializeAntenna(row) : null;
}

export async function fetchAntennaByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: MiAntenna['id'],
): Promise<MiAntenna> {
	const row = await fetchAntennaByIdFromDatabase(db, id);

	if (row == null) {
		throw new EntityNotFoundError(MiAntenna, { id });
	}

	return row;
}

export async function fetchAntennaByIdAndUserIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiAntenna['id'],
	userId: MiUser['id'],
): Promise<MiAntenna | null> {
	const [row] = await db
		.select()
		.from(antenna)
		.where(and(
			eq(antenna.id, id),
			eq(antenna.userId, userId),
		))
		.limit(1);

	return row ? deserializeAntenna(row) : null;
}

export async function antennaExistsForUserFromDatabase(
	db: MiDrizzleDatabase,
	id: MiAntenna['id'],
	userId: MiUser['id'],
): Promise<boolean> {
	const [row] = await db
		.select({ id: antenna.id })
		.from(antenna)
		.where(and(
			eq(antenna.id, id),
			eq(antenna.userId, userId),
		))
		.limit(1);

	return row != null;
}

export async function listAntennasByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<MiAntenna[]> {
	const rows = await db
		.select()
		.from(antenna)
		.where(eq(antenna.userId, userId));

	return rows.map(deserializeAntenna);
}

/**
 * AntennaService のインメモリキャッシュ向け。isActive な Antenna を全件取得する。
 * ノート配信時のマッチ判定で使われるホットパスなので、フィルタ条件・全件取得の挙動を変えないこと。
 */
export async function listActiveAntennasFromDatabase(
	db: MiDrizzleDatabase,
): Promise<MiAntenna[]> {
	const rows = await db
		.select()
		.from(antenna)
		.where(eq(antenna.isActive, true));

	return rows.map(deserializeAntenna);
}

export async function listAntennasByIdsFromDatabase(
	db: MiDrizzleDatabase,
	ids: MiAntenna['id'][],
): Promise<MiAntenna[]> {
	if (ids.length === 0) return [];

	const rows = await db
		.select()
		.from(antenna)
		.where(inArray(antenna.id, ids));

	return rows.map(deserializeAntenna);
}

/**
 * アカウント移行 (onMoveAccount) 向け。対象 Antenna 群の users 配列末尾へ
 * dstUserAcct を追記する (array_append)。
 */
export async function appendUserToAntennasInDatabase(
	db: MiDrizzleDatabase,
	ids: MiAntenna['id'][],
	acct: string,
): Promise<void> {
	if (ids.length === 0) return;

	await db
		.update(antenna)
		.set({
			users: sql`array_append(${antenna.users}, ${acct})`,
		})
		.where(inArray(antenna.id, ids));
}

/**
 * CleanProcessorService 向け。しばらく使われていない Antenna を非アクティブ化する。
 */
export async function deactivateAntennasNotUsedSinceFromDatabase(
	db: MiDrizzleDatabase,
	cutoff: Date,
): Promise<void> {
	await db
		.update(antenna)
		.set({ isActive: false })
		.where(lt(antenna.lastUsedAt, cutoff));
}
