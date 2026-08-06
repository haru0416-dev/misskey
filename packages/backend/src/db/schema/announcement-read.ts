/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiAnnouncement } from '@/models/Announcement.js';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';
import { announcement } from './announcement.js';

export const announcementRead = pgTable(
	'announcement_read',
	{
		id: varchar({ length: 32 }).primaryKey().notNull(),
		userId: varchar({ length: 32 })
			.notNull()
			.$type<MiUser['id']>()
			.references(() => user.id, { onDelete: 'cascade' }),
		announcementId: varchar({ length: 32 })
			.notNull()
			.$type<MiAnnouncement['id']>()
			.references(() => announcement.id, { onDelete: 'cascade' }),
	},
	(table) => [
		index('IDX_ANNOUNCEMENT_READ_USER_ID').on(table.userId),
		index('IDX_ANNOUNCEMENT_READ_ANNOUNCEMENT_ID').on(table.announcementId),
		uniqueIndex('IDX_ANNOUNCEMENT_READ_USER_ID_ANNOUNCEMENT_ID_UNIQUE').on(table.userId, table.announcementId),
	],
);

export type AnnouncementReadRow = typeof announcementRead.$inferSelect;
export type AnnouncementReadInsert = typeof announcementRead.$inferInsert;
