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

export const galleryPost = pgTable(
	'gallery_post',
	{
		id: varchar({ length: 32 }).primaryKey().notNull(),
		updatedAt: timestamp({ withTimezone: true }).notNull(),
		title: varchar({ length: 256 }).notNull(),
		description: varchar({ length: 2048 }),
		userId: varchar({ length: 32 })
			.notNull()
			.$type<MiUser['id']>()
			.references(() => user.id, { onDelete: 'cascade' }),
		fileIds: varchar({ length: 32 }).array().default(emptyVarcharArray).notNull().$type<MiDriveFile['id'][]>(),
		isSensitive: boolean().default(false).notNull(),
		likedCount: integer().default(0).notNull(),
		tags: varchar({ length: 128 }).array().default(emptyVarcharArray).notNull(),
	},
	(table) => [
		index('IDX_GALLERY_POST_UPDATED_AT').on(table.updatedAt),
		index('IDX_GALLERY_POST_USER_ID').on(table.userId),
		index('IDX_GALLERY_POST_FILE_IDS').on(table.fileIds),
		index('IDX_GALLERY_POST_IS_SENSITIVE').on(table.isSensitive),
		index('IDX_GALLERY_POST_LIKED_COUNT').on(table.likedCount),
		index('IDX_GALLERY_POST_TAGS').on(table.tags),
	],
);

export type GalleryPostRow = typeof galleryPost.$inferSelect;
export type GalleryPostInsert = typeof galleryPost.$inferInsert;
