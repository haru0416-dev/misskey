/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';

const emptyVarcharArray = sql`'{}'::character varying[]`;

export const galleryPost = pgTable('gallery_post', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	updatedAt: timestamp({ withTimezone: true }).notNull(),
	title: varchar({ length: 256 }).notNull(),
	description: varchar({ length: 2048 }),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	fileIds: varchar({ length: 32 }).array().default(emptyVarcharArray).notNull().$type<MiDriveFile['id'][]>(),
	isSensitive: boolean().default(false).notNull(),
	likedCount: integer().default(0).notNull(),
	tags: varchar({ length: 128 }).array().default(emptyVarcharArray).notNull(),
}, table => [
	index('IDX_f631d37835adb04792e361807c').on(table.updatedAt),
	index('IDX_985b836dddd8615e432d7043dd').on(table.userId),
	index('IDX_3ca50563facd913c425e7a89ee').on(table.fileIds),
	index('IDX_f2d744d9a14d0dfb8b96cb7fc5').on(table.isSensitive),
	index('IDX_1a165c68a49d08f11caffbd206').on(table.likedCount),
	index('IDX_05cca34b985d1b8edc1d1e28df').on(table.tags),
]);

export type GalleryPostRow = typeof galleryPost.$inferSelect;
export type GalleryPostInsert = typeof galleryPost.$inferInsert;
