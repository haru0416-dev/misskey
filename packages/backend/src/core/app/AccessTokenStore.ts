/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq } from 'drizzle-orm';
import { accessToken } from '@/db/schema/access-token.js';
import type { AccessTokenInsert, AccessTokenRow } from '@/db/schema/access-token.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiUser } from '@/models/User.js';

export type AccessTokenOrderField = 'id' | 'lastUsedAt';
export type AccessTokenOrderDirection = 'asc' | 'desc';

export async function fetchAccessTokenBySessionFromDatabase(
	db: MiDrizzleDatabase,
	session: NonNullable<AccessTokenRow['session']>,
): Promise<AccessTokenRow | null> {
	const [row] = await db.select().from(accessToken).where(eq(accessToken.session, session)).limit(1);

	return row ?? null;
}

export async function fetchAccessTokenByTokenFromDatabase(
	db: MiDrizzleDatabase,
	token: AccessTokenRow['token'],
): Promise<AccessTokenRow | null> {
	const [row] = await db.select().from(accessToken).where(eq(accessToken.token, token)).limit(1);

	return row ?? null;
}

/** i/apps (自分の API トークン一覧) 向け。 */
export async function listAccessTokensByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	order: {
		field: AccessTokenOrderField;
		direction: AccessTokenOrderDirection;
	},
): Promise<AccessTokenRow[]> {
	const orderByColumn = order.field === 'lastUsedAt' ? accessToken.lastUsedAt : accessToken.id;

	return await db
		.select()
		.from(accessToken)
		.where(eq(accessToken.userId, userId))
		.orderBy(order.direction === 'asc' ? asc(orderByColumn) : desc(orderByColumn));
}

export async function createAccessTokenInDatabase(db: MiDrizzleDatabase, data: AccessTokenInsert): Promise<void> {
	await db.insert(accessToken).values(data);
}

export async function markAccessTokenFetchedInDatabase(db: MiDrizzleDatabase, id: AccessTokenRow['id']): Promise<void> {
	await db.update(accessToken).set({ fetched: true }).where(eq(accessToken.id, id));
}

export async function updateAccessTokenLastUsedAtInDatabase(
	db: MiDrizzleDatabase,
	id: AccessTokenRow['id'],
	lastUsedAt: Date,
): Promise<void> {
	await db.update(accessToken).set({ lastUsedAt }).where(eq(accessToken.id, id));
}

export async function deleteAccessTokenByIdAndUserIdFromDatabase(
	db: MiDrizzleDatabase,
	id: AccessTokenRow['id'],
	userId: MiUser['id'],
): Promise<void> {
	await db.delete(accessToken).where(and(eq(accessToken.id, id), eq(accessToken.userId, userId)));
}

export async function deleteAccessTokenByTokenAndUserIdFromDatabase(
	db: MiDrizzleDatabase,
	token: AccessTokenRow['token'],
	userId: MiUser['id'],
): Promise<void> {
	await db.delete(accessToken).where(and(eq(accessToken.token, token), eq(accessToken.userId, userId)));
}

export async function deleteAccessTokenByTokenFromDatabase(
	db: MiDrizzleDatabase,
	token: AccessTokenRow['token'],
): Promise<void> {
	await db.delete(accessToken).where(eq(accessToken.token, token));
}
