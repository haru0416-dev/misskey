/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiPage } from '@/models/Page.js';
import type { MiUser } from '@/models/User.js';
import { page } from './page.js';
import { user } from './user.js';

export const pageLike = pgTable('page_like', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	pageId: varchar({ length: 32 }).notNull().$type<MiPage['id']>().references(() => page.id, { onDelete: 'cascade' }),
}, table => [
	index('IDX_0e61efab7f88dbb79c9166dbb4').on(table.userId),
	index('IDX_PAGE_LIKE_PAGE_ID').on(table.pageId),
	uniqueIndex('IDX_4ce6fb9c70529b4c8ac46c9bfa').on(table.userId, table.pageId),
]);

export type PageLikeRow = typeof pageLike.$inferSelect;
export type PageLikeInsert = typeof pageLike.$inferInsert;
