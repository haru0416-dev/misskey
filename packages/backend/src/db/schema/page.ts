/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgEnum, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';
import { driveFile } from './drive-file.js';

const emptyVarcharArray = sql`'{}'::character varying[]`;

export const pageVisibilityEnum = pgEnum('page_visibility_enum', ['public', 'followers', 'specified']);

export const page = pgTable('page', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	updatedAt: timestamp({ withTimezone: true }).notNull(),
	title: varchar({ length: 256 }).notNull(),
	name: varchar({ length: 256 }).notNull(),
	summary: varchar({ length: 256 }),
	alignCenter: boolean().notNull(),
	hideTitleWhenPinned: boolean().default(false).notNull(),
	font: varchar({ length: 32 }).notNull().$type<'serif' | 'sans-serif'>(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	eyeCatchingImageId: varchar({ length: 32 }).$type<MiDriveFile['id'] | null>().references(() => driveFile.id, { onDelete: 'set null' }),
	content: jsonb().$type<Record<string, unknown>[]>().default([]).notNull(),
	variables: jsonb().$type<Record<string, unknown>[]>().default([]).notNull(),
	script: varchar({ length: 16384 }).default('').notNull(),
	// public ... 公開 / followers ... フォロワーのみ / specified ... visibleUserIds で指定したユーザーのみ
	visibility: pageVisibilityEnum().notNull().$type<'public' | 'followers' | 'specified'>(),
	visibleUserIds: varchar({ length: 32 }).array().default(emptyVarcharArray).notNull().$type<MiUser['id'][]>(),
	likedCount: integer().default(0).notNull(),
}, table => [
	index('IDX_PAGE_UPDATED_AT').on(table.updatedAt),
	index('IDX_PAGE_NAME').on(table.name),
	index('IDX_PAGE_USER_ID').on(table.userId),
	index('IDX_PAGE_VISIBLE_USER_IDS').on(table.visibleUserIds),
	index('IDX_PAGE_EYE_CATCHING_IMAGE_ID').on(table.eyeCatchingImageId),
	uniqueIndex('IDX_PAGE_USER_ID_NAME_UNIQUE').on(table.userId, table.name),
]);

export type PageRow = typeof page.$inferSelect;
export type PageInsert = typeof page.$inferInsert;
