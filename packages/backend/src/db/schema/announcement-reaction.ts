/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiAnnouncement } from '@/models/Announcement.js';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';
import { announcement } from './announcement.js';

export const announcementReaction = pgTable(
	'announcement_reaction',
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
		// note_reaction と同じ長さ。カスタム絵文字は `:name:` 形式で入る。
		reaction: varchar({ length: 260 }).notNull(),
	},
	(table) => [
		index('IDX_ANNOUNCEMENT_REACTION_ANNOUNCEMENT_ID').on(table.announcementId),
		// 1 ユーザー 1 お知らせにつき 1 リアクション (ノートと同じ)。
		uniqueIndex('IDX_ANNOUNCEMENT_REACTION_USER_ID_ANNOUNCEMENT_ID_UNIQUE').on(table.userId, table.announcementId),
	],
);

export type AnnouncementReactionRow = typeof announcementReaction.$inferSelect;
export type AnnouncementReactionInsert = typeof announcementReaction.$inferInsert;
