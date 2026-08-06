/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiChatRoom } from '@/models/ChatRoom.js';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';
import { chatRoom } from './chat-room.js';

export const chatRoomInvitation = pgTable(
	'chat_room_invitation',
	{
		id: varchar({ length: 32 }).primaryKey().notNull(),
		userId: varchar({ length: 32 })
			.notNull()
			.$type<MiUser['id']>()
			.references(() => user.id, { onDelete: 'cascade' }),
		roomId: varchar({ length: 32 })
			.notNull()
			.$type<MiChatRoom['id']>()
			.references(() => chatRoom.id, { onDelete: 'cascade' }),
		ignored: boolean().default(false).notNull(),
	},
	(table) => [
		index('IDX_CHAT_ROOM_INVITATION_USER_ID').on(table.userId),
		index('IDX_CHAT_ROOM_INVITATION_ROOM_ID').on(table.roomId),
		uniqueIndex('IDX_CHAT_ROOM_INVITATION_USER_ID_ROOM_ID_UNIQUE').on(table.userId, table.roomId),
	],
);

export type ChatRoomInvitationRow = typeof chatRoomInvitation.$inferSelect;
export type ChatRoomInvitationInsert = typeof chatRoomInvitation.$inferInsert;
