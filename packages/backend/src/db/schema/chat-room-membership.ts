/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiChatRoom } from '@/models/ChatRoom.js';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';
import { chatRoom } from './chat-room.js';

export const chatRoomMembership = pgTable('chat_room_membership', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	roomId: varchar({ length: 32 }).notNull().$type<MiChatRoom['id']>().references(() => chatRoom.id, { onDelete: 'cascade' }),
	isMuted: boolean().default(false).notNull(),
}, table => [
	index('IDX_d99c5279460fb77ef58c596ce5').on(table.userId),
	index('IDX_c25143ebab714e930aeca1c0e8').on(table.roomId),
	uniqueIndex('IDX_185b6b5afa707b5d36d1ce3144').on(table.userId, table.roomId),
]);

export type ChatRoomMembershipRow = typeof chatRoomMembership.$inferSelect;
export type ChatRoomMembershipInsert = typeof chatRoomMembership.$inferInsert;
