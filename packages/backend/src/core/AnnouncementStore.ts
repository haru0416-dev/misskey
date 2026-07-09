/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq, gt, isNull, lt, notInArray, or, type SQL } from 'drizzle-orm';
import { announcement, type AnnouncementInsert, type AnnouncementRow } from '@/db/schema/announcement.js';
import { announcementRead } from '@/db/schema/announcement-read.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import { MiAnnouncement } from '@/models/Announcement.js';
import type { MiUser } from '@/models/User.js';

export type AnnouncementOrder = 'asc' | 'desc';

function deserializeAnnouncement(row: AnnouncementRow): MiAnnouncement {
	return {
		...row,
		user: null,
	} as MiAnnouncement;
}

function applyAnnouncementPaginationCondition(
	conditions: SQL[],
	sinceId?: string | null,
	untilId?: string | null,
): void {
	if (sinceId && untilId) {
		conditions.push(gt(announcement.id, sinceId));
		conditions.push(lt(announcement.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(announcement.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(announcement.id, untilId));
	}
}

export function resolveAnnouncementPagination(
	idService: { gen(time?: number): string },
	options: {
		sinceId?: string | null;
		untilId?: string | null;
		sinceDate?: number | null;
		untilDate?: number | null;
	},
): {
	sinceId?: string | null;
	untilId?: string | null;
	order: AnnouncementOrder;
} {
	return resolveDateIdPagination(idService, options);
}

export async function fetchAnnouncementByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiAnnouncement['id'],
): Promise<MiAnnouncement | null> {
	const [row] = await db
		.select()
		.from(announcement)
		.where(eq(announcement.id, id))
		.limit(1);

	return row == null ? null : deserializeAnnouncement(row);
}

export async function fetchAnnouncementByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: MiAnnouncement['id'],
): Promise<MiAnnouncement> {
	const row = await fetchAnnouncementByIdFromDatabase(db, id);

	if (row == null) {
		throw new EntityNotFoundError(MiAnnouncement, { id });
	}

	return row;
}

export async function fetchGlobalAnnouncementByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiAnnouncement['id'],
): Promise<MiAnnouncement | null> {
	const [row] = await db
		.select()
		.from(announcement)
		.where(and(
			eq(announcement.id, id),
			isNull(announcement.userId),
		))
		.limit(1);

	return row == null ? null : deserializeAnnouncement(row);
}

export async function createAnnouncementInDatabase(
	db: MiDrizzleDatabase,
	data: AnnouncementInsert,
): Promise<MiAnnouncement> {
	const [row] = await db
		.insert(announcement)
		.values(data)
		.returning();

	if (row == null) {
		throw new Error('Failed to create announcement');
	}

	return deserializeAnnouncement(row);
}

export async function updateAnnouncementInDatabase(
	db: MiDrizzleDatabase,
	id: MiAnnouncement['id'],
	values: Partial<AnnouncementInsert>,
): Promise<void> {
	await db
		.update(announcement)
		.set(values)
		.where(eq(announcement.id, id));
}

export async function deleteAnnouncementInDatabase(
	db: MiDrizzleDatabase,
	id: MiAnnouncement['id'],
): Promise<void> {
	await db
		.delete(announcement)
		.where(eq(announcement.id, id));
}

/**
 * 指定したユーザーにとって未読の、有効かつ非サイレンスなお知らせ (全体向け・ユーザー向け両方) を列挙する。
 */
export async function listUnreadAnnouncementsForUserFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<MiAnnouncement[]> {
	const rows = await db
		.select()
		.from(announcement)
		.where(and(
			eq(announcement.isActive, true),
			eq(announcement.silence, false),
			or(
				eq(announcement.userId, userId),
				isNull(announcement.userId),
			),
			or(
				eq(announcement.forExistingUsers, false),
				gt(announcement.id, userId),
			),
			notInArray(
				announcement.id,
				db
					.select({ announcementId: announcementRead.announcementId })
					.from(announcementRead)
					.where(eq(announcementRead.userId, userId)),
			),
		));

	return rows.map(deserializeAnnouncement);
}

/**
 * 「お知らせ」画面 (未認証含む) 向けの一覧。有効なお知らせのうち、全体向け + (ログイン中なら) 自分向けのものを対象にする。
 */
export async function listAnnouncementsForUserFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		limit: number;
		order: AnnouncementOrder;
		sinceId?: string | null;
		untilId?: string | null;
		isActive: boolean;
		requestUserId?: MiUser['id'] | null;
	},
): Promise<MiAnnouncement[]> {
	const conditions: SQL[] = [];
	applyAnnouncementPaginationCondition(conditions, options.sinceId, options.untilId);

	conditions.push(eq(announcement.isActive, options.isActive));

	conditions.push(
		options.requestUserId
			? or(
				eq(announcement.userId, options.requestUserId),
				isNull(announcement.userId),
			)!
			: isNull(announcement.userId),
	);

	const rows = await db
		.select()
		.from(announcement)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(announcement.id) : desc(announcement.id))
		.limit(options.limit);

	return rows.map(deserializeAnnouncement);
}

/**
 * admin/announcements/list 向けの一覧。status (all/active/archived) と userId (null = 全体向け) で絞り込む。
 */
export async function listAnnouncementsForAdminFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		limit: number;
		order: AnnouncementOrder;
		sinceId?: string | null;
		untilId?: string | null;
		status: 'all' | 'active' | 'archived';
		userId?: MiUser['id'] | null;
	},
): Promise<MiAnnouncement[]> {
	const conditions: SQL[] = [];
	applyAnnouncementPaginationCondition(conditions, options.sinceId, options.untilId);

	switch (options.status) {
		case 'active': conditions.push(eq(announcement.isActive, true)); break;
		case 'archived': conditions.push(eq(announcement.isActive, false)); break;
	}

	conditions.push(
		options.userId
			? eq(announcement.userId, options.userId)
			: isNull(announcement.userId),
	);

	const rows = await db
		.select()
		.from(announcement)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(announcement.id) : desc(announcement.id))
		.limit(options.limit);

	return rows.map(deserializeAnnouncement);
}
