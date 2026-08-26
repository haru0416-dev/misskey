/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { index, pgTable, varchar } from 'drizzle-orm/pg-core';
import type { MiChatRoom } from '@/models/ChatRoom.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';
import { chatRoom } from './chat-room.js';
import { driveFile } from './drive-file.js';

const emptyVarcharArray = sql`'{}'::character varying[]`;

export const chatMessage = pgTable(
	'chat_message',
	{
		id: varchar({ length: 32 }).primaryKey().notNull(),
		fromUserId: varchar({ length: 32 })
			.notNull()
			.$type<MiUser['id']>()
			.references(() => user.id, { onDelete: 'cascade' }),
		toUserId: varchar({ length: 32 })
			.$type<MiUser['id'] | null>()
			.references(() => user.id, { onDelete: 'cascade' }),
		toRoomId: varchar({ length: 32 })
			.$type<MiChatRoom['id'] | null>()
			.references(() => chatRoom.id, { onDelete: 'cascade' }),
		text: varchar({ length: 4096 }),
		uri: varchar({ length: 512 }),
		reads: varchar({ length: 32 }).array().default(emptyVarcharArray).notNull().$type<MiUser['id'][]>(),
		fileId: varchar({ length: 32 })
			.$type<MiDriveFile['id'] | null>()
			.references(() => driveFile.id, { onDelete: 'set null' }),
		reactions: varchar({ length: 1024 }).array().default(emptyVarcharArray).notNull(),
	},
	(table) => [
		index('IDX_CHAT_MESSAGE_FROM_USER_ID').on(table.fromUserId),
		index('IDX_CHAT_MESSAGE_TO_USER_ID').on(table.toUserId),
		index('IDX_CHAT_MESSAGE_TO_ROOM_ID').on(table.toRoomId),
		index('IDX_CHAT_MESSAGE_FILE_ID').on(table.fileId),
	],
);

export type ChatMessageRow = typeof chatMessage.$inferSelect;
export type ChatMessageInsert = typeof chatMessage.$inferInsert;
