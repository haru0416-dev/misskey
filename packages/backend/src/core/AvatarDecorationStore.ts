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

export async function createAvatarDecorationInDatabase(db: MiDrizzleDatabase, data: AvatarDecorationInsert): Promise<AvatarDecorationRow> {
	const [row] = await db
		.insert(avatarDecoration)
		.values(removeUndefined(data) as AvatarDecorationInsert)
		.returning();

	if (!row) {
		throw new Error('Avatar decoration row was not created');
	}

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

	return row ?? null;
}

export async function deleteAvatarDecorationFromDatabase(db: MiDrizzleDatabase, id: MiAvatarDecoration['id']): Promise<void> {
	await db
		.delete(avatarDecoration)
		.where(eq(avatarDecoration.id, id));
}

export async function listAvatarDecorationsFromDatabase(db: MiDrizzleDatabase): Promise<AvatarDecorationRow[]> {
	return db
		.select()
		.from(avatarDecoration);
}
