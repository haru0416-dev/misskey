/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, jsonb, pgTable, varchar } from 'drizzle-orm/pg-core';
import type { MiModerationLog } from '@/models/ModerationLog.js';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';

export const moderationLog = pgTable('moderation_log', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	type: varchar({ length: 128 }).notNull(),
	info: jsonb().$type<MiModerationLog['info']>().notNull(),
}, table => [
	index('IDX_MODERATION_LOG_USER_ID').on(table.userId),
	index('IDX_MODERATION_LOG_TYPE_ID').on(table.type, table.id),
	index('IDX_MODERATION_LOG_USER_ID_ID').on(table.userId, table.id),
]);

export type ModerationLogRow = typeof moderationLog.$inferSelect;
export type ModerationLogInsert = typeof moderationLog.$inferInsert;
