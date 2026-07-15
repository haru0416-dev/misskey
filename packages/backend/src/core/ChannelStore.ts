/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq, gt, inArray, isNotNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { channel, type ChannelInsert, type ChannelRow } from '@/db/schema/channel.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import type { MiChannel } from '@/models/Channel.js';
import type { MiUser } from '@/models/User.js';

export type ChannelOrder = 'asc' | 'desc';
export type ChannelUpdate = Partial<Omit<ChannelRow, 'id'>>;

function deserializeChannel(row: ChannelRow): MiChannel {
	return {
		...row,
		user: null,
		banner: null,
	} as MiChannel;
}

function applyChannelPaginationCondition(
	conditions: SQL[],
	sinceId?: string | null,
	untilId?: string | null,
): void {
	if (sinceId && untilId) {
		conditions.push(gt(channel.id, sinceId));
		conditions.push(lt(channel.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(channel.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(channel.id, untilId));
	}
}

export function resolveChannelPagination(
	idService: { gen(time?: number): string },
	options: {
		sinceId?: string | null;
		untilId?: string | null;
		sinceDate?: number | null;
		untilDate?: number | null;
	},
): {
	sinceId: string | null;
	untilId: string | null;
	order: ChannelOrder;
} {
	return resolveDateIdPagination(idService, options);
}

export async function listChannelsByIdsFromDatabase(
	db: MiDrizzleDatabase,
	ids: MiChannel['id'][],
): Promise<MiChannel[]> {
	if (ids.length === 0) return [];

	const rows = await db
		.select()
		.from(channel)
		.where(inArray(channel.id, ids));

	return rows.map(row => deserializeChannel(row));
}

export async function createChannelInDatabase(
	db: MiDrizzleDatabase,
	data: ChannelInsert,
): Promise<MiChannel> {
	const [row] = await db
		.insert(channel)
		.values(data)
		.returning();

	if (row == null) {
		throw new Error('Failed to create channel');
	}

	return deserializeChannel(row);
}

export async function updateChannelInDatabase(
	db: MiDrizzleDatabase,
	id: MiChannel['id'],
	values: ChannelUpdate,
): Promise<void> {
	await db
		.update(channel)
		.set(values)
		.where(eq(channel.id, id));
}

export async function listOwnedChannelsFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	options: {
		limit: number;
		sinceId?: MiChannel['id'] | null;
		untilId?: MiChannel['id'] | null;
		order: ChannelOrder;
	},
): Promise<MiChannel[]> {
	const conditions: SQL[] = [
		eq(channel.isArchived, false),
		eq(channel.userId, userId),
	];

	applyChannelPaginationCondition(conditions, options.sinceId, options.untilId);

	const rows = await db
		.select()
		.from(channel)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(channel.id) : desc(channel.id))
		.limit(options.limit);

	return rows.map(row => deserializeChannel(row));
}

export async function listRecentlyActiveChannelsFromDatabase(
	db: MiDrizzleDatabase,
	limit: number,
): Promise<MiChannel[]> {
	const rows = await db
		.select()
		.from(channel)
		.where(and(
			isNotNull(channel.lastNotedAt),
			eq(channel.isArchived, false),
		))
		.orderBy(desc(channel.lastNotedAt))
		.limit(limit);

	return rows.map(row => deserializeChannel(row));
}

export async function listChannelsBySearchFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		query: string;
		type: 'nameAndDescription' | 'nameOnly';
		limit: number;
		sinceId?: MiChannel['id'] | null;
		untilId?: MiChannel['id'] | null;
		order: 'asc' | 'desc';
	},
): Promise<MiChannel[]> {
	const conditions: SQL[] = [
		eq(channel.isArchived, false),
	];

	applyChannelPaginationCondition(conditions, options.sinceId, options.untilId);

	if (options.query !== '') {
		const like = `%${options.query}%`;
		if (options.type === 'nameAndDescription') {
			conditions.push(or(
				sql`${channel.name} ILIKE ${like}`,
				sql`${channel.description} ILIKE ${like}`,
			)!);
		} else {
			conditions.push(sql`${channel.name} ILIKE ${like}`);
		}
	}

	const rows = await db
		.select()
		.from(channel)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(channel.id) : desc(channel.id))
		.limit(options.limit);

	return rows.map(row => deserializeChannel(row));
}

export async function fetchChannelByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiChannel['id'],
): Promise<MiChannel | null> {
	const [row] = await db
		.select()
		.from(channel)
		.where(eq(channel.id, id))
		.limit(1);

	return row ? deserializeChannel(row) : null;
}

export async function fetchChannelByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: MiChannel['id'],
): Promise<MiChannel> {
	const channel = await fetchChannelByIdFromDatabase(db, id);

	if (channel == null) {
		throw new EntityNotFoundError('MiChannel', { id });
	}

	return channel;
}

export async function incrementChannelNotesCountAndUpdateLastNotedAtInDatabase(
	db: MiDrizzleDatabase,
	id: MiChannel['id'],
	lastNotedAt: Date,
): Promise<void> {
	await db
		.update(channel)
		.set({
			notesCount: sql`${channel.notesCount} + 1`,
			lastNotedAt,
		})
		.where(eq(channel.id, id));
}

export async function incrementChannelUsersCountInDatabase(
	db: MiDrizzleDatabase,
	id: MiChannel['id'],
): Promise<void> {
	await db
		.update(channel)
		.set({ usersCount: sql`${channel.usersCount} + 1` })
		.where(eq(channel.id, id));
}
