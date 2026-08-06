/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, eq, gt, inArray, isNull, lt, or, sql, type Placeholder } from 'drizzle-orm';
import { preparedQueryFor, UNNAMED_PREPARED_STATEMENT } from '@/db/prepared.js';
import { channelMuting, type ChannelMutingInsert, type ChannelMutingRow } from '@/db/schema/channel-muting.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiChannel } from '@/models/Channel.js';
import type { MiUser } from '@/models/User.js';

function channelMutingCondition(userId: MiUser['id'], channelId: MiChannel['id']) {
	return and(eq(channelMuting.userId, userId), eq(channelMuting.channelId, channelId));
}

function activeChannelMutingCondition(now: Date | Placeholder) {
	return or(isNull(channelMuting.expiresAt), gt(channelMuting.expiresAt, now));
}

export async function channelMutingExistsInDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	channelId: MiChannel['id'],
): Promise<boolean> {
	const [row] = await db
		.select({ id: channelMuting.id })
		.from(channelMuting)
		.where(channelMutingCondition(userId, channelId))
		.limit(1);

	return row != null;
}

export async function listMutedChannelIdsByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<MiChannel['id'][]> {
	const rows = await db
		.select({ channelId: channelMuting.channelId })
		.from(channelMuting)
		.where(eq(channelMuting.userId, userId));

	return rows.map((row) => row.channelId);
}

export async function listActiveMutedChannelIdsByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	now: Date,
): Promise<MiChannel['id'][]> {
	const statement = preparedQueryFor(db, 'channelMuting:activeChannelIdsByUserId', () =>
		db
			.select({ channelId: channelMuting.channelId })
			.from(channelMuting)
			.where(
				and(eq(channelMuting.userId, sql.placeholder('userId')), activeChannelMutingCondition(sql.placeholder('now'))),
			)
			.prepare(UNNAMED_PREPARED_STATEMENT),
	);
	const rows = await statement.execute({ userId, now });

	return rows.map((row) => row.channelId);
}

export async function fetchMutedChannelIdsByUserIdAndChannelIdsFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	channelIds: MiChannel['id'][],
): Promise<Set<MiChannel['id']>> {
	if (channelIds.length === 0) {
		return new Set();
	}

	const rows = await db
		.select({ channelId: channelMuting.channelId })
		.from(channelMuting)
		.where(and(eq(channelMuting.userId, userId), inArray(channelMuting.channelId, channelIds)));

	return new Set(rows.map((row) => row.channelId));
}

export async function listExpiredChannelMutingsFromDatabase(
	db: MiDrizzleDatabase,
	now: Date,
): Promise<ChannelMutingRow[]> {
	return await db.select().from(channelMuting).where(lt(channelMuting.expiresAt, now));
}

export async function createChannelMutingInDatabase(db: MiDrizzleDatabase, data: ChannelMutingInsert): Promise<void> {
	await db.insert(channelMuting).values(data);
}

export async function updateChannelMutingExpirationInDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	channelId: MiChannel['id'],
	expiresAt: Date | null,
): Promise<void> {
	await db.update(channelMuting).set({ expiresAt }).where(channelMutingCondition(userId, channelId));
}

export async function deleteChannelMutingFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	channelId: MiChannel['id'],
): Promise<void> {
	await db.delete(channelMuting).where(channelMutingCondition(userId, channelId));
}

export async function deleteChannelMutingsByIdsFromDatabase(
	db: MiDrizzleDatabase,
	ids: ChannelMutingRow['id'][],
): Promise<void> {
	if (ids.length === 0) {
		return;
	}

	await db.delete(channelMuting).where(inArray(channelMuting.id, ids));
}
