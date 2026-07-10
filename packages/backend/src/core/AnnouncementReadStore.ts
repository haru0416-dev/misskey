/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, count, eq, inArray } from 'drizzle-orm';
import { announcementRead, type AnnouncementReadInsert, type AnnouncementReadRow } from '@/db/schema/announcement-read.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiAnnouncement } from '@/models/Announcement.js';
import type { MiUser } from '@/models/User.js';

function announcementReadCondition(userId: MiUser['id'], announcementId: MiAnnouncement['id']) {
	return and(
		eq(announcementRead.userId, userId),
		eq(announcementRead.announcementId, announcementId),
	);
}

export async function listAnnouncementReadsByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<AnnouncementReadRow[]> {
	return await db
		.select()
		.from(announcementRead)
		.where(eq(announcementRead.userId, userId));
}

export async function announcementReadExistsInDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	announcementId: MiAnnouncement['id'],
): Promise<boolean> {
	const [row] = await db
		.select({ id: announcementRead.id })
		.from(announcementRead)
		.where(announcementReadCondition(userId, announcementId))
		.limit(1);

	return row != null;
}

export async function listReadAnnouncementIdsByUserIdAndAnnouncementIdsFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	announcementIds: MiAnnouncement['id'][],
): Promise<MiAnnouncement['id'][]> {
	if (announcementIds.length === 0) return [];

	const rows = await db
		.select({ announcementId: announcementRead.announcementId })
		.from(announcementRead)
		.where(and(
			eq(announcementRead.userId, userId),
			inArray(announcementRead.announcementId, announcementIds),
		));

	return rows.map(row => row.announcementId);
}

export async function createAnnouncementReadInDatabase(
	db: MiDrizzleDatabase,
	data: AnnouncementReadInsert,
): Promise<boolean> {
	const [row] = await db
		.insert(announcementRead)
		.values(data)
		.onConflictDoNothing({
			target: [
				announcementRead.userId,
				announcementRead.announcementId,
			],
		})
		.returning({ id: announcementRead.id });

	return row != null;
}

export async function countAnnouncementReadsByAnnouncementIdsFromDatabase(
	db: MiDrizzleDatabase,
	announcementIds: MiAnnouncement['id'][],
): Promise<Map<MiAnnouncement['id'], number>> {
	if (announcementIds.length === 0) {
		return new Map();
	}

	const rows = await db
		.select({
			announcementId: announcementRead.announcementId,
			count: count(),
		})
		.from(announcementRead)
		.where(inArray(announcementRead.announcementId, announcementIds))
		.groupBy(announcementRead.announcementId);

	return new Map(rows.map(row => [row.announcementId, row.count]));
}
