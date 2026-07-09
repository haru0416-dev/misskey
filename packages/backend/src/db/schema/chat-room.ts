/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, index, pgTable, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';

export const chatRoom = pgTable('chat_room', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	name: varchar({ length: 256 }).notNull(),
	ownerId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	description: varchar({ length: 2048 }).default('').notNull(),
	isArchived: boolean().default(false).notNull(),
}, table => [
	index('IDX_f0d8ad64243fa2ca2800da0dfd').on(table.ownerId),
]);

export type ChatRoomRow = typeof chatRoom.$inferSelect;
export type ChatRoomInsert = typeof chatRoom.$inferInsert;
