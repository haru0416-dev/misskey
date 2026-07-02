/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq, isNotNull, or } from 'drizzle-orm';
import { accessToken, type AccessTokenInsert, type AccessTokenRow } from '@/db/schema/access-token.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import { MiAccessToken } from '@/models/AccessToken.js';
import type { MiApp } from '@/models/App.js';
import type { MiUser } from '@/models/User.js';

export type AccessTokenOrderField = 'id' | 'lastUsedAt';
export type AccessTokenOrderDirection = 'asc' | 'desc';

function accessTokenByAppAndUserCondition(appId: MiApp['id'], userId: MiUser['id']) {
	return and(
		eq(accessToken.appId, appId),
		eq(accessToken.userId, userId),
	);
}

export async function fetchAccessTokenBySessionFromDatabase(
	db: MiDrizzleDatabase,
	session: NonNullable<AccessTokenRow['session']>,
): Promise<AccessTokenRow | null> {
	const [row] = await db
		.select()
		.from(accessToken)
		.where(eq(accessToken.session, session))
		.limit(1);

	return row ?? null;
}

export async function fetchAccessTokenByHashOrTokenFromDatabase(
	db: MiDrizzleDatabase,
	hash: AccessTokenRow['hash'],
	token: AccessTokenRow['token'],
): Promise<AccessTokenRow | null> {
	const [row] = await db
		.select()
		.from(accessToken)
		.where(or(
			eq(accessToken.hash, hash),
			eq(accessToken.token, token),
		))
		.limit(1);

	return row ?? null;
}

export async function fetchAccessTokenByAppIdAndUserIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	appId: MiApp['id'],
	userId: MiUser['id'],
): Promise<AccessTokenRow> {
	const [row] = await db
		.select()
		.from(accessToken)
		.where(accessTokenByAppAndUserCondition(appId, userId))
		.limit(1);

	if (row == null) {
		throw new EntityNotFoundError(MiAccessToken, { appId, userId });
	}

	return row;
}

export async function existsAccessTokenByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: AccessTokenRow['id'],
): Promise<boolean> {
	const [row] = await db
		.select({ id: accessToken.id })
		.from(accessToken)
		.where(eq(accessToken.id, id))
		.limit(1);

	return row != null;
}

export async function existsAccessTokenByTokenFromDatabase(
	db: MiDrizzleDatabase,
	token: AccessTokenRow['token'],
): Promise<boolean> {
	const [row] = await db
		.select({ id: accessToken.id })
		.from(accessToken)
		.where(eq(accessToken.token, token))
		.limit(1);

	return row != null;
}

export async function existsAccessTokenByAppIdAndUserIdFromDatabase(
	db: MiDrizzleDatabase,
	appId: MiApp['id'],
	userId: MiUser['id'],
): Promise<boolean> {
	const [row] = await db
		.select({ id: accessToken.id })
		.from(accessToken)
		.where(accessTokenByAppAndUserCondition(appId, userId))
		.limit(1);

	return row != null;
}

/**
 * i/apps.ts (自分の API トークン一覧) 向け。app リレーションは呼び出し元でバッチ取得する。
 */
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

/**
 * i/authorized-apps.ts (連携アプリ一覧) 向け。appId が設定されているトークンのみ対象。
 */
export async function listAccessTokensWithAppByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	options: {
		limit: number;
		offset: number;
		direction: AccessTokenOrderDirection;
	},
): Promise<AccessTokenRow[]> {
	return await db
		.select()
		.from(accessToken)
		.where(and(
			eq(accessToken.userId, userId),
			isNotNull(accessToken.appId),
		))
		.orderBy(options.direction === 'asc' ? asc(accessToken.id) : desc(accessToken.id))
		.limit(options.limit)
		.offset(options.offset);
}

export async function createAccessTokenInDatabase(
	db: MiDrizzleDatabase,
	data: AccessTokenInsert,
): Promise<void> {
	await db
		.insert(accessToken)
		.values(data);
}

export async function markAccessTokenFetchedInDatabase(
	db: MiDrizzleDatabase,
	id: AccessTokenRow['id'],
): Promise<void> {
	await db
		.update(accessToken)
		.set({ fetched: true })
		.where(eq(accessToken.id, id));
}

export async function updateAccessTokenLastUsedAtInDatabase(
	db: MiDrizzleDatabase,
	id: AccessTokenRow['id'],
	lastUsedAt: Date,
): Promise<void> {
	await db
		.update(accessToken)
		.set({ lastUsedAt })
		.where(eq(accessToken.id, id));
}

export async function deleteAccessTokenByIdAndUserIdFromDatabase(
	db: MiDrizzleDatabase,
	id: AccessTokenRow['id'],
	userId: MiUser['id'],
): Promise<void> {
	await db
		.delete(accessToken)
		.where(and(
			eq(accessToken.id, id),
			eq(accessToken.userId, userId),
		));
}

export async function deleteAccessTokenByTokenAndUserIdFromDatabase(
	db: MiDrizzleDatabase,
	token: AccessTokenRow['token'],
	userId: MiUser['id'],
): Promise<void> {
	await db
		.delete(accessToken)
		.where(and(
			eq(accessToken.token, token),
			eq(accessToken.userId, userId),
		));
}

export async function deleteAccessTokenByTokenFromDatabase(
	db: MiDrizzleDatabase,
	token: AccessTokenRow['token'],
): Promise<void> {
	await db
		.delete(accessToken)
		.where(eq(accessToken.token, token));
}
