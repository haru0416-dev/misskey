/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, eq, inArray } from 'drizzle-orm';
import { channelFavorite, type ChannelFavoriteInsert } from '@/db/schema/channel-favorite.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiChannel } from '@/models/Channel.js';
import type { MiUser } from '@/models/User.js';

function channelFavoriteCondition(userId: MiUser['id'], channelId: MiChannel['id']) {
	return and(
		eq(channelFavorite.userId, userId),
		eq(channelFavorite.channelId, channelId),
	);
}

export async function channelFavoriteExistsInDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	channelId: MiChannel['id'],
): Promise<boolean> {
	const [row] = await db
		.select({ id: channelFavorite.id })
		.from(channelFavorite)
		.where(channelFavoriteCondition(userId, channelId))
		.limit(1);

	return row != null;
}

export async function createChannelFavoriteInDatabase(
	db: MiDrizzleDatabase,
	data: ChannelFavoriteInsert,
): Promise<void> {
	await db
		.insert(channelFavorite)
		.values(data);
}

export async function deleteChannelFavoriteFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	channelId: MiChannel['id'],
): Promise<void> {
	await db
		.delete(channelFavorite)
		.where(channelFavoriteCondition(userId, channelId));
}

export async function fetchFavoriteChannelIdsFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<MiChannel['id'][]> {
	const rows = await db
		.select({ channelId: channelFavorite.channelId })
		.from(channelFavorite)
		.where(eq(channelFavorite.userId, userId));

	return rows.map(row => row.channelId);
}

export async function fetchFavoritedChannelIdsInDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	channelIds: MiChannel['id'][],
): Promise<Set<MiChannel['id']>> {
	if (channelIds.length === 0) {
		return new Set();
	}

	const rows = await db
		.select({ channelId: channelFavorite.channelId })
		.from(channelFavorite)
		.where(and(
			eq(channelFavorite.userId, userId),
			inArray(channelFavorite.channelId, channelIds),
		));

	return new Set(rows.map(row => row.channelId));
}
