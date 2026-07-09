/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiClip } from '@/models/Clip.js';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';
import { clip } from './clip.js';

export const clipFavorite = pgTable('clip_favorite', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	clipId: varchar({ length: 32 }).notNull().$type<MiClip['id']>().references(() => clip.id, { onDelete: 'cascade' }),
}, table => [
	index('IDX_CLIP_FAVORITE_USER_ID').on(table.userId),
	index('IDX_CLIP_FAVORITE_CLIP_ID').on(table.clipId),
	uniqueIndex('IDX_CLIP_FAVORITE_USER_ID_CLIP_ID_UNIQUE').on(table.userId, table.clipId),
]);

export type ClipFavoriteRow = typeof clipFavorite.$inferSelect;
export type ClipFavoriteInsert = typeof clipFavorite.$inferInsert;
