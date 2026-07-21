/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, eq } from 'drizzle-orm';
import { authSession, type AuthSessionInsert, type AuthSessionRow } from '@/db/schema/auth-session.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiApp } from '@/models/App.js';
import type { MiUser } from '@/models/User.js';

async function fetchAuthSessionByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: AuthSessionRow['id'],
): Promise<AuthSessionRow> {
	const [row] = await db.select().from(authSession).where(eq(authSession.id, id)).limit(1);

	if (row == null) {
		throw new Error(`Auth session ${id} not found`);
	}

	return row;
}

export async function fetchAuthSessionByTokenFromDatabase(
	db: MiDrizzleDatabase,
	token: AuthSessionRow['token'],
): Promise<AuthSessionRow | null> {
	const [row] = await db.select().from(authSession).where(eq(authSession.token, token)).limit(1);

	return row ?? null;
}

export async function fetchAuthSessionByTokenAndAppIdFromDatabase(
	db: MiDrizzleDatabase,
	token: AuthSessionRow['token'],
	appId: MiApp['id'],
): Promise<AuthSessionRow | null> {
	const [row] = await db
		.select()
		.from(authSession)
		.where(and(eq(authSession.token, token), eq(authSession.appId, appId)))
		.limit(1);

	return row ?? null;
}

export async function createAuthSessionInDatabase(
	db: MiDrizzleDatabase,
	data: AuthSessionInsert,
): Promise<AuthSessionRow> {
	const [row] = await db.insert(authSession).values(data).returning();

	if (row == null) {
		throw new Error('Failed to create auth session');
	}

	return row;
}

export async function updateAuthSessionUserIdInDatabase(
	db: MiDrizzleDatabase,
	id: AuthSessionRow['id'],
	userId: MiUser['id'],
): Promise<void> {
	await db.update(authSession).set({ userId }).where(eq(authSession.id, id));
}

export async function deleteAuthSessionByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: AuthSessionRow['id'],
): Promise<void> {
	await db.delete(authSession).where(eq(authSession.id, id));
}
