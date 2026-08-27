/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, count, eq, inArray } from 'drizzle-orm';
import { announcementReaction, type AnnouncementReactionInsert } from '@/db/schema/announcement-reaction.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiAnnouncement } from '@/models/Announcement.js';
import type { MiUser } from '@/models/User.js';

export async function createAnnouncementReactionInDatabase(
	db: MiDrizzleDatabase,
	data: AnnouncementReactionInsert,
): Promise<boolean> {
	const [row] = await db
		.insert(announcementReaction)
		.values(data)
		.onConflictDoNothing({
			target: [announcementReaction.userId, announcementReaction.announcementId],
		})
		.returning({ id: announcementReaction.id });

	return row != null;
}

export async function deleteAnnouncementReactionInDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	announcementId: MiAnnouncement['id'],
): Promise<boolean> {
	const [row] = await db
		.delete(announcementReaction)
		.where(and(eq(announcementReaction.userId, userId), eq(announcementReaction.announcementId, announcementId)))
		.returning({ id: announcementReaction.id });

	return row != null;
}

/** お知らせ 1 件あたり `{ リアクション: 件数 }`。リアクションが 1 つも無いお知らせは入らない。 */
export async function countAnnouncementReactionsByAnnouncementIdsFromDatabase(
	db: MiDrizzleDatabase,
	announcementIds: MiAnnouncement['id'][],
): Promise<Map<MiAnnouncement['id'], Record<string, number>>> {
	if (announcementIds.length === 0) return new Map();

	const rows = await db
		.select({
			announcementId: announcementReaction.announcementId,
			reaction: announcementReaction.reaction,
			count: count(),
		})
		.from(announcementReaction)
		.where(inArray(announcementReaction.announcementId, announcementIds))
		.groupBy(announcementReaction.announcementId, announcementReaction.reaction);

	const result = new Map<MiAnnouncement['id'], Record<string, number>>();
	for (const row of rows) {
		const bucket = result.get(row.announcementId) ?? {};
		bucket[row.reaction] = row.count;
		result.set(row.announcementId, bucket);
	}
	return result;
}

/** 自分が付けたリアクション。付けていないお知らせは入らない。 */
export async function listMyAnnouncementReactionsFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	announcementIds: MiAnnouncement['id'][],
): Promise<Map<MiAnnouncement['id'], string>> {
	if (announcementIds.length === 0) return new Map();

	const rows = await db
		.select({
			announcementId: announcementReaction.announcementId,
			reaction: announcementReaction.reaction,
		})
		.from(announcementReaction)
		.where(and(eq(announcementReaction.userId, userId), inArray(announcementReaction.announcementId, announcementIds)));

	return new Map(rows.map((row) => [row.announcementId, row.reaction]));
}
