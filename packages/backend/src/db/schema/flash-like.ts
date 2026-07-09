/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiFlash } from '@/models/Flash.js';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';
import { flash } from './flash.js';

export const flashLike = pgTable('flash_like', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	flashId: varchar({ length: 32 }).notNull().$type<MiFlash['id']>().references(() => flash.id, { onDelete: 'cascade' }),
}, table => [
	index('IDX_FLASH_LIKE_USER_ID').on(table.userId),
	index('IDX_FLASH_LIKE_FLASH_ID').on(table.flashId),
	uniqueIndex('IDX_FLASH_LIKE_USER_ID_FLASH_ID_UNIQUE').on(table.userId, table.flashId),
]);

export type FlashLikeRow = typeof flashLike.$inferSelect;
export type FlashLikeInsert = typeof flashLike.$inferInsert;
