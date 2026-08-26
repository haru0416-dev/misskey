/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';
import { hashtag, type HashtagInsert, type HashtagRow } from '@/db/schema/hashtag.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import type { MiHashtag } from '@/models/Hashtag.js';
import type { MiUser } from '@/models/User.js';

type HashtagUpdateSet = Partial<
	Record<
		| 'mentionedUserIds'
		| 'mentionedUsersCount'
		| 'mentionedLocalUserIds'
		| 'mentionedLocalUsersCount'
		| 'mentionedRemoteUserIds'
		| 'mentionedRemoteUsersCount'
		| 'attachedUserIds'
		| 'attachedUsersCount'
		| 'attachedLocalUserIds'
		| 'attachedLocalUsersCount'
		| 'attachedRemoteUserIds'
		| 'attachedRemoteUsersCount',
		SQL
	>
>;

type HashtagUserIdsColumn =
	| typeof hashtag.mentionedUserIds
	| typeof hashtag.mentionedLocalUserIds
	| typeof hashtag.mentionedRemoteUserIds
	| typeof hashtag.attachedUserIds
	| typeof hashtag.attachedLocalUserIds
	| typeof hashtag.attachedRemoteUserIds;

type HashtagUsersCountColumn =
	| typeof hashtag.mentionedUsersCount
	| typeof hashtag.mentionedLocalUsersCount
	| typeof hashtag.mentionedRemoteUsersCount
	| typeof hashtag.attachedUsersCount
	| typeof hashtag.attachedLocalUsersCount
	| typeof hashtag.attachedRemoteUsersCount;

export type HashtagSort =
	| '+mentionedUsers'
	| '-mentionedUsers'
	| '+mentionedLocalUsers'
	| '-mentionedLocalUsers'
	| '+mentionedRemoteUsers'
	| '-mentionedRemoteUsers'
	| '+attachedUsers'
	| '-attachedUsers'
	| '+attachedLocalUsers'
	| '-attachedLocalUsers'
	| '+attachedRemoteUsers'
	| '-attachedRemoteUsers';

function deserializeHashtag(row: HashtagRow): MiHashtag {
	return row as MiHashtag;
}

function appendUserIdIfMissing(userIds: HashtagUserIdsColumn, count: HashtagUsersCountColumn, userId: MiUser['id']) {
	return {
		userIds: sql`CASE WHEN array_position(${userIds}, ${userId}) IS NULL THEN array_append(${userIds}, ${userId}) ELSE ${userIds} END`,
		count: sql`CASE WHEN array_position(${userIds}, ${userId}) IS NULL THEN ${count} + 1 ELSE ${count} END`,
	};
}

function removeUserIdIfExists(userIds: HashtagUserIdsColumn, count: HashtagUsersCountColumn, userId: MiUser['id']) {
	return {
		userIds: sql`CASE WHEN array_position(${userIds}, ${userId}) IS NOT NULL THEN array_remove(${userIds}, ${userId}) ELSE ${userIds} END`,
		count: sql`CASE WHEN array_position(${userIds}, ${userId}) IS NOT NULL THEN ${count} - 1 ELSE ${count} END`,
	};
}

function getOrderBy(sort: HashtagSort) {
	switch (sort) {
		case '+mentionedUsers':
			return desc(hashtag.mentionedUsersCount);
		case '-mentionedUsers':
			return asc(hashtag.mentionedUsersCount);
		case '+mentionedLocalUsers':
			return desc(hashtag.mentionedLocalUsersCount);
		case '-mentionedLocalUsers':
			return asc(hashtag.mentionedLocalUsersCount);
		case '+mentionedRemoteUsers':
			return desc(hashtag.mentionedRemoteUsersCount);
		case '-mentionedRemoteUsers':
			return asc(hashtag.mentionedRemoteUsersCount);
		case '+attachedUsers':
			return desc(hashtag.attachedUsersCount);
		case '-attachedUsers':
			return asc(hashtag.attachedUsersCount);
		case '+attachedLocalUsers':
			return desc(hashtag.attachedLocalUsersCount);
		case '-attachedLocalUsers':
			return asc(hashtag.attachedLocalUsersCount);
		case '+attachedRemoteUsers':
			return desc(hashtag.attachedRemoteUsersCount);
		case '-attachedRemoteUsers':
			return asc(hashtag.attachedRemoteUsersCount);
	}
}

export async function fetchHashtagByNameFromDatabase(db: MiDrizzleDatabase, name: string): Promise<MiHashtag | null> {
	const [row] = await db.select().from(hashtag).where(eq(hashtag.name, name)).limit(1);

	return row == null ? null : deserializeHashtag(row);
}

export async function listHashtagsFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		limit: number;
		attachedToUserOnly: boolean;
		attachedToLocalUserOnly: boolean;
		attachedToRemoteUserOnly: boolean;
		sort: HashtagSort;
	},
): Promise<MiHashtag[]> {
	const conditions: SQL[] = [];

	if (options.attachedToUserOnly) conditions.push(ne(hashtag.attachedUsersCount, 0));
	if (options.attachedToLocalUserOnly) conditions.push(ne(hashtag.attachedLocalUsersCount, 0));
	if (options.attachedToRemoteUserOnly) conditions.push(ne(hashtag.attachedRemoteUsersCount, 0));

	const rows = await db
		.select()
		.from(hashtag)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(getOrderBy(options.sort))
		.limit(options.limit);

	return rows.map(deserializeHashtag);
}

export async function searchHashtagNamesFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		query: string;
		limit: number;
		offset: number;
	},
): Promise<string[]> {
	const rows = await db
		.select({ name: hashtag.name })
		.from(hashtag)
		.where(sql`${hashtag.name} like ${sqlLikeEscape(options.query.toLowerCase()) + '%'}`)
		.orderBy(desc(hashtag.mentionedLocalUsersCount))
		.limit(options.limit)
		.offset(options.offset);

	return rows.map((row) => row.name);
}

export async function recordHashtagUsagesInDatabase(
	db: MiDrizzleDatabase,
	data: {
		entries: { id: MiHashtag['id']; name: MiHashtag['name'] }[];
		userId: MiUser['id'];
		isLocalUser: boolean;
		isRemoteUser: boolean;
		isUserAttached: boolean;
		increment: boolean;
	},
): Promise<void> {
	const entries = [...new Map(data.entries.map((entry) => [entry.name, entry])).values()];
	if (entries.length === 0) return;

	if (!data.increment) {
		const set: HashtagUpdateSet = {};

		if (data.isUserAttached) {
			const attachedUsers = removeUserIdIfExists(hashtag.attachedUserIds, hashtag.attachedUsersCount, data.userId);
			set.attachedUserIds = attachedUsers.userIds;
			set.attachedUsersCount = attachedUsers.count;

			if (data.isLocalUser) {
				const attachedLocalUsers = removeUserIdIfExists(
					hashtag.attachedLocalUserIds,
					hashtag.attachedLocalUsersCount,
					data.userId,
				);
				set.attachedLocalUserIds = attachedLocalUsers.userIds;
				set.attachedLocalUsersCount = attachedLocalUsers.count;
			} else {
				const attachedRemoteUsers = removeUserIdIfExists(
					hashtag.attachedRemoteUserIds,
					hashtag.attachedRemoteUsersCount,
					data.userId,
				);
				set.attachedRemoteUserIds = attachedRemoteUsers.userIds;
				set.attachedRemoteUsersCount = attachedRemoteUsers.count;
			}
		}

		if (Object.keys(set).length > 0) {
			await db
				.update(hashtag)
				.set(set)
				.where(
					inArray(
						hashtag.name,
						entries.map((entry) => entry.name),
					),
				);
		}

		return;
	}

	const insertData: HashtagInsert[] = entries.map((entry) =>
		data.isUserAttached
			? {
					id: entry.id,
					name: entry.name,
					mentionedUserIds: [],
					mentionedUsersCount: 0,
					mentionedLocalUserIds: [],
					mentionedLocalUsersCount: 0,
					mentionedRemoteUserIds: [],
					mentionedRemoteUsersCount: 0,
					attachedUserIds: [data.userId],
					attachedUsersCount: 1,
					attachedLocalUserIds: data.isLocalUser ? [data.userId] : [],
					attachedLocalUsersCount: data.isLocalUser ? 1 : 0,
					attachedRemoteUserIds: data.isRemoteUser ? [data.userId] : [],
					attachedRemoteUsersCount: data.isRemoteUser ? 1 : 0,
				}
			: {
					id: entry.id,
					name: entry.name,
					mentionedUserIds: [data.userId],
					mentionedUsersCount: 1,
					mentionedLocalUserIds: data.isLocalUser ? [data.userId] : [],
					mentionedLocalUsersCount: data.isLocalUser ? 1 : 0,
					mentionedRemoteUserIds: data.isRemoteUser ? [data.userId] : [],
					mentionedRemoteUsersCount: data.isRemoteUser ? 1 : 0,
					attachedUserIds: [],
					attachedUsersCount: 0,
					attachedLocalUserIds: [],
					attachedLocalUsersCount: 0,
					attachedRemoteUserIds: [],
					attachedRemoteUsersCount: 0,
				},
	);

	const set: HashtagUpdateSet = {};

	if (data.isUserAttached) {
		const attachedUsers = appendUserIdIfMissing(hashtag.attachedUserIds, hashtag.attachedUsersCount, data.userId);
		set.attachedUserIds = attachedUsers.userIds;
		set.attachedUsersCount = attachedUsers.count;

		if (data.isLocalUser) {
			const attachedLocalUsers = appendUserIdIfMissing(
				hashtag.attachedLocalUserIds,
				hashtag.attachedLocalUsersCount,
				data.userId,
			);
			set.attachedLocalUserIds = attachedLocalUsers.userIds;
			set.attachedLocalUsersCount = attachedLocalUsers.count;
		}

		if (data.isRemoteUser) {
			const attachedRemoteUsers = appendUserIdIfMissing(
				hashtag.attachedRemoteUserIds,
				hashtag.attachedRemoteUsersCount,
				data.userId,
			);
			set.attachedRemoteUserIds = attachedRemoteUsers.userIds;
			set.attachedRemoteUsersCount = attachedRemoteUsers.count;
		}
	} else {
		const mentionedUsers = appendUserIdIfMissing(hashtag.mentionedUserIds, hashtag.mentionedUsersCount, data.userId);
		set.mentionedUserIds = mentionedUsers.userIds;
		set.mentionedUsersCount = mentionedUsers.count;

		if (data.isLocalUser) {
			const mentionedLocalUsers = appendUserIdIfMissing(
				hashtag.mentionedLocalUserIds,
				hashtag.mentionedLocalUsersCount,
				data.userId,
			);
			set.mentionedLocalUserIds = mentionedLocalUsers.userIds;
			set.mentionedLocalUsersCount = mentionedLocalUsers.count;
		}

		if (data.isRemoteUser) {
			const mentionedRemoteUsers = appendUserIdIfMissing(
				hashtag.mentionedRemoteUserIds,
				hashtag.mentionedRemoteUsersCount,
				data.userId,
			);
			set.mentionedRemoteUserIds = mentionedRemoteUsers.userIds;
			set.mentionedRemoteUsersCount = mentionedRemoteUsers.count;
		}
	}

	await db.insert(hashtag).values(insertData).onConflictDoUpdate({
		target: hashtag.name,
		set,
	});
}
