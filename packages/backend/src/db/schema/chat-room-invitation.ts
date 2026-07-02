/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiChatRoom } from '@/models/ChatRoom.js';
import type { MiUser } from '@/models/User.js';

export const chatRoomInvitation = pgTable('chat_room_invitation', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	roomId: varchar({ length: 32 }).notNull().$type<MiChatRoom['id']>(),
	ignored: boolean().default(false).notNull(),
}, table => [
	index('IDX_8552bb38e7ed038c5bdd398a38').on(table.userId),
	index('IDX_5f265075b215fc390a57523b12').on(table.roomId),
	uniqueIndex('IDX_044f2a7962b8ee5bbfaa02e8a3').on(table.userId, table.roomId),
]);

export type ChatRoomInvitationRow = typeof chatRoomInvitation.$inferSelect;
export type ChatRoomInvitationInsert = typeof chatRoomInvitation.$inferInsert;
