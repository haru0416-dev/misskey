/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';

export const announcement = pgTable(
	'announcement',
	{
		id: varchar({ length: 32 }).primaryKey().notNull(),
		updatedAt: timestamp({ withTimezone: true }),
		text: varchar({ length: 8192 }).notNull(),
		title: varchar({ length: 256 }).notNull(),
		imageUrl: varchar({ length: 1024 }),
		icon: varchar({ length: 256, enum: ['info', 'warning', 'error', 'success'] })
			.default('info')
			.notNull(),
		display: varchar({ length: 256, enum: ['normal', 'banner', 'dialog'] })
			.default('normal')
			.notNull(),
		needConfirmationToRead: boolean().default(false).notNull(),
		isActive: boolean().default(true).notNull(),
		forExistingUsers: boolean().default(false).notNull(),
		silence: boolean().default(false).notNull(),
		userId: varchar({ length: 32 })
			.$type<MiUser['id'] | null>()
			.references(() => user.id, { onDelete: 'cascade' }),
	},
	(table) => [
		index('IDX_ANNOUNCEMENT_IS_ACTIVE').on(table.isActive),
		index('IDX_ANNOUNCEMENT_FOR_EXISTING_USERS').on(table.forExistingUsers),
		index('IDX_ANNOUNCEMENT_SILENCE').on(table.silence),
		index('IDX_ANNOUNCEMENT_USER_ID').on(table.userId),
	],
);

export type AnnouncementRow = typeof announcement.$inferSelect;
export type AnnouncementInsert = typeof announcement.$inferInsert;
