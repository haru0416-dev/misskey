/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiGalleryPost } from '@/models/GalleryPost.js';
import type { MiUser } from '@/models/User.js';
import { galleryPost } from './gallery-post.js';
import { user } from './user.js';

export const galleryLike = pgTable('gallery_like', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	postId: varchar({ length: 32 }).notNull().$type<MiGalleryPost['id']>().references(() => galleryPost.id, { onDelete: 'cascade' }),
}, table => [
	index('IDX_8fd5215095473061855ceb948c').on(table.userId),
	index('IDX_GALLERY_LIKE_POST_ID').on(table.postId),
	uniqueIndex('IDX_df1b5f4099e99fb0bc5eae53b6').on(table.userId, table.postId),
]);

export type GalleryLikeRow = typeof galleryLike.$inferSelect;
export type GalleryLikeInsert = typeof galleryLike.$inferInsert;
