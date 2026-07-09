/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiAnnouncement } from '@/models/Announcement.js';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';
import { announcement } from './announcement.js';

export const announcementRead = pgTable('announcement_read', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	announcementId: varchar({ length: 32 }).notNull().$type<MiAnnouncement['id']>().references(() => announcement.id, { onDelete: 'cascade' }),
}, table => [
	index('IDX_8288151386172b8109f7239ab2').on(table.userId),
	index('IDX_603a7b1e7aa0533c6c88e9bfaf').on(table.announcementId),
	uniqueIndex('IDX_924fa71815cfa3941d003702a0').on(table.userId, table.announcementId),
]);

export type AnnouncementReadRow = typeof announcementRead.$inferSelect;
export type AnnouncementReadInsert = typeof announcementRead.$inferInsert;
