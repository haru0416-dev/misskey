/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { eq } from 'drizzle-orm';
import { avatarDecoration, type AvatarDecorationInsert, type AvatarDecorationRow } from '@/db/schema/avatar-decoration.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiAvatarDecoration } from '@/models/AvatarDecoration.js';

type AvatarDecorationPatch = Partial<AvatarDecorationInsert>;

function removeUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
	return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

let cachedRows: AvatarDecorationRow[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 1000 * 60;

function invalidateAvatarDecorationCache(): void {
	cachedRows = null;
}

export async function createAvatarDecorationInDatabase(db: MiDrizzleDatabase, data: AvatarDecorationInsert): Promise<AvatarDecorationRow> {
	const [row] = await db
		.insert(avatarDecoration)
		.values(removeUndefined(data) as AvatarDecorationInsert)
		.returning();

	if (!row) {
		throw new Error('Avatar decoration row was not created');
	}

	invalidateAvatarDecorationCache();
	return row;
}

export async function fetchAvatarDecorationFromDatabase(db: MiDrizzleDatabase, id: MiAvatarDecoration['id']): Promise<AvatarDecorationRow | null> {
	const [row] = await db
		.select()
		.from(avatarDecoration)
		.where(eq(avatarDecoration.id, id))
		.limit(1);

	return row ?? null;
}

export async function updateAvatarDecorationInDatabase(
	db: MiDrizzleDatabase,
	id: MiAvatarDecoration['id'],
	data: AvatarDecorationPatch,
): Promise<AvatarDecorationRow | null> {
	const [row] = await db
		.update(avatarDecoration)
		.set(removeUndefined(data))
		.where(eq(avatarDecoration.id, id))
		.returning();

	invalidateAvatarDecorationCache();
	return row ?? null;
}

export async function deleteAvatarDecorationFromDatabase(db: MiDrizzleDatabase, id: MiAvatarDecoration['id']): Promise<void> {
	await db
		.delete(avatarDecoration)
		.where(eq(avatarDecoration.id, id));

	invalidateAvatarDecorationCache();
}

export async function listAvatarDecorationsFromDatabase(db: MiDrizzleDatabase): Promise<AvatarDecorationRow[]> {
	return db
		.select()
		.from(avatarDecoration);
}

/**
 * listAvatarDecorationsFromDatabase のプロセスローカル短命キャッシュ版。
 * ノートpack時のアバターデコレーション解決 (ユーザー毎・ノート毎に呼ばれるホットパス) 専用。
 * 管理系のCRUD/一覧エンドポイントは即時性が必要なため常に listAvatarDecorationsFromDatabase を使うこと。
 */
export async function listAvatarDecorationsFromDatabaseCached(db: MiDrizzleDatabase): Promise<AvatarDecorationRow[]> {
	if (cachedRows != null && Date.now() - cachedAt < CACHE_TTL_MS) {
		return cachedRows;
	}

	const rows = await listAvatarDecorationsFromDatabase(db);
	cachedRows = rows;
	cachedAt = Date.now();
	return rows;
}
