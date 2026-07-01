/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiFlash } from '@/models/Flash.js';
import type { MiUser } from '@/models/User.js';

export const flashLike = pgTable('flash_like', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	flashId: varchar({ length: 32 }).notNull().$type<MiFlash['id']>(),
}, table => [
	index('IDX_60c4af1c19a7a75f1592f93b28').on(table.userId),
	index('IDX_FLASH_LIKE_FLASH_ID').on(table.flashId),
	uniqueIndex('IDX_cfbfeeccb0cbedcd660b17eb07').on(table.userId, table.flashId),
]);

export type FlashLikeRow = typeof flashLike.$inferSelect;
export type FlashLikeInsert = typeof flashLike.$inferInsert;
