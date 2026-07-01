/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { index, pgTable, varchar } from 'drizzle-orm/pg-core';
import type { MiChatRoom } from '@/models/ChatRoom.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiUser } from '@/models/User.js';

const emptyVarcharArray = sql`'{}'::character varying[]`;

export const chatMessage = pgTable('chat_message', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	fromUserId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	toUserId: varchar({ length: 32 }).$type<MiUser['id'] | null>(),
	toRoomId: varchar({ length: 32 }).$type<MiChatRoom['id'] | null>(),
	text: varchar({ length: 4096 }),
	uri: varchar({ length: 512 }),
	reads: varchar({ length: 32 }).array().default(emptyVarcharArray).notNull().$type<MiUser['id'][]>(),
	fileId: varchar({ length: 32 }).$type<MiDriveFile['id'] | null>(),
	reactions: varchar({ length: 1024 }).array().default(emptyVarcharArray).notNull(),
}, table => [
	index('IDX_79a26e7a4d9afa5e4fc05f134e').on(table.fromUserId),
	index('IDX_25e097b51d7622c249452c6f75').on(table.toUserId),
	index('IDX_f006b8a76efd1abf9f221c175c').on(table.toRoomId),
	index('IDX_CHAT_MESSAGE_FILE_ID').on(table.fileId),
]);

export type ChatMessageRow = typeof chatMessage.$inferSelect;
export type ChatMessageInsert = typeof chatMessage.$inferInsert;
