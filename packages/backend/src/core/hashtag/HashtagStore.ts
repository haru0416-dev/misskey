/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { hashtag } from '@/db/schema/hashtag.js';
import type { HashtagRow } from '@/db/schema/hashtag.js';
import { hashtagUser } from '@/db/schema/hashtag-user.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import type { MiHashtag } from '@/models/Hashtag.js';
import type { MiUser } from '@/models/User.js';

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

	if (options.attachedToUserOnly) {
		conditions.push(ne(hashtag.attachedUsersCount, 0));
	}
	if (options.attachedToLocalUserOnly) {
		conditions.push(ne(hashtag.attachedLocalUsersCount, 0));
	}
	if (options.attachedToRemoteUserOnly) {
		conditions.push(ne(hashtag.attachedRemoteUsersCount, 0));
	}

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

type HashtagUsageFlags = { isLocalUser: boolean; isRemoteUser: boolean; isUserAttached: boolean };

/** 利用者を数える件数の列。isUserAttached でプロフィールのタグ (attached*) か投稿のタグ (mentioned*) かが決まる。 */
function usersCountColumns(flags: HashtagUsageFlags) {
	return flags.isUserAttached
		? {
				all: hashtag.attachedUsersCount,
				local: hashtag.attachedLocalUsersCount,
				remote: hashtag.attachedRemoteUsersCount,
			}
		: {
				all: hashtag.mentionedUsersCount,
				local: hashtag.mentionedLocalUsersCount,
				remote: hashtag.mentionedRemoteUsersCount,
			};
}

function usersCountDelta(flags: HashtagUsageFlags, delta: 1 | -1): Partial<Record<keyof HashtagRow, SQL>> {
	const columns = usersCountColumns(flags);
	const set: Partial<Record<keyof HashtagRow, SQL>> = { [columns.all.name]: sql`${columns.all} + ${delta}` };
	if (flags.isLocalUser) set[columns.local.name as keyof HashtagRow] = sql`${columns.local} + ${delta}`;
	if (flags.isRemoteUser) set[columns.remote.name as keyof HashtagRow] = sql`${columns.remote} + ${delta}`;
	return set;
}

/**
 * タグを使った利用者を数える。同じ人が何度使っても 1 人と数え、既に数えた人では hashtag を書き換えない。
 * increment が false のときは、プロフィールからタグを外した人を数えから除く (投稿のタグは減らさない)。
 */
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
	if (entries.length === 0) {
		return;
	}
	const flags = { isLocalUser: data.isLocalUser, isRemoteUser: data.isRemoteUser, isUserAttached: data.isUserAttached };
	const names = entries.map((entry) => entry.name);

	if (!data.increment) {
		if (!data.isUserAttached) {
			return;
		}
		const removed = await db
			.delete(hashtagUser)
			.where(
				and(
					eq(hashtagUser.attached, true),
					eq(hashtagUser.userId, data.userId),
					inArray(
						hashtagUser.hashtagId,
						db.select({ id: hashtag.id }).from(hashtag).where(inArray(hashtag.name, names)),
					),
				),
			)
			.returning({ hashtagId: hashtagUser.hashtagId });
		if (removed.length > 0) {
			await db
				.update(hashtag)
				.set(usersCountDelta(flags, -1))
				.where(
					inArray(
						hashtag.id,
						removed.map((row) => row.hashtagId),
					),
				);
		}
		return;
	}

	const existing = await db
		.select({ id: hashtag.id, name: hashtag.name })
		.from(hashtag)
		.where(inArray(hashtag.name, names));
	const existingNames = new Set(existing.map((row) => row.name));
	const missing = entries.filter((entry) => !existingNames.has(entry.name));

	// 新しいタグはこの人を数えた状態で作る。同じタグを別の投稿が同時に作っていても id を受け取れるよう、
	// DO NOTHING ではなく DO UPDATE で既存の行も返させ、作れたかどうかは xmax で見分ける。
	const created = new Set<MiHashtag['id']>();
	const tagIds = existing.map((row) => row.id);
	if (missing.length > 0) {
		const columns = usersCountColumns(flags);
		const inserted = await db
			.insert(hashtag)
			.values(
				missing.map((entry) => ({
					id: entry.id,
					name: entry.name,
					[columns.all.name]: 1,
					...(flags.isLocalUser ? { [columns.local.name]: 1 } : {}),
					...(flags.isRemoteUser ? { [columns.remote.name]: 1 } : {}),
				})),
			)
			.onConflictDoUpdate({ target: hashtag.name, set: { name: sql`excluded."name"` } })
			.returning({ id: hashtag.id, inserted: sql<boolean>`xmax = 0` });
		for (const row of inserted) {
			tagIds.push(row.id);
			if (row.inserted) created.add(row.id);
		}
	}

	// 既に数えた人の行とは競合するだけで、何も書かない。
	const added = await db
		.insert(hashtagUser)
		.values(tagIds.map((hashtagId) => ({ hashtagId, attached: data.isUserAttached, userId: data.userId })))
		.onConflictDoNothing()
		.returning({ hashtagId: hashtagUser.hashtagId });
	const toIncrement = added.map((row) => row.hashtagId).filter((id) => !created.has(id));
	if (toIncrement.length > 0) {
		await db.update(hashtag).set(usersCountDelta(flags, 1)).where(inArray(hashtag.id, toIncrement));
	}
}
