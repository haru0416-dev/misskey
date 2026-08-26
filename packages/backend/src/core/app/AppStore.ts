/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { eq, inArray } from 'drizzle-orm';
import { app, type AppInsert, type AppRow } from '@/db/schema/app.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiUser } from '@/models/User.js';

export async function fetchAppByIdFromDatabase(db: MiDrizzleDatabase, id: AppRow['id']): Promise<AppRow | null> {
	const [row] = await db.select().from(app).where(eq(app.id, id)).limit(1);

	return row ?? null;
}

export async function fetchAppByIdOrFailFromDatabase(db: MiDrizzleDatabase, id: AppRow['id']): Promise<AppRow> {
	const row = await fetchAppByIdFromDatabase(db, id);

	if (row == null) {
		throw new Error(`App ${id} not found`);
	}

	return row;
}

export async function fetchAppBySecretFromDatabase(
	db: MiDrizzleDatabase,
	secret: AppRow['secret'],
): Promise<AppRow | null> {
	const [row] = await db.select().from(app).where(eq(app.secret, secret)).limit(1);

	return row ?? null;
}

/**
 * i/apps.ts の一覧向け。トークンごとに個別クエリを飛ばして N+1 にならないよう、
 * 対象の appId 群をまとめて1クエリで取得する。
 */
export async function listAppsByIdsFromDatabase(db: MiDrizzleDatabase, ids: AppRow['id'][]): Promise<AppRow[]> {
	if (ids.length === 0) return [];

	return await db.select().from(app).where(inArray(app.id, ids));
}

export async function listAppsByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	options: {
		limit: number;
		offset: number;
	},
): Promise<AppRow[]> {
	return await db.select().from(app).where(eq(app.userId, userId)).limit(options.limit).offset(options.offset);
}

export async function createAppInDatabase(db: MiDrizzleDatabase, data: AppInsert): Promise<AppRow> {
	const [row] = await db.insert(app).values(data).returning();

	if (row == null) {
		throw new Error('Failed to create app');
	}

	return row;
}
