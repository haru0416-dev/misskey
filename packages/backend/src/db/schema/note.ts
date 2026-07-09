/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgEnum, pgTable, smallint, text, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { noteVisibilities, type noteReactionAcceptances } from '@/types.js';
import type { MiChannel } from '@/models/Channel.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';
import { channel } from './channel.js';

const emptyIdArray = sql`'{}'::character varying[]`;
const emptyVarcharArray = sql`'{}'::character varying[]`;
export const noteVisibilityEnum = pgEnum('note_visibility_enum', noteVisibilities);

export const note = pgTable('note', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	replyId: varchar({ length: 32 }).$type<MiNote['id'] | null>(),
	renoteId: varchar({ length: 32 }).$type<MiNote['id'] | null>(),
	threadId: varchar({ length: 256 }),
	text: text(),
	name: varchar({ length: 256 }),
	cw: varchar({ length: 512 }),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	localOnly: boolean().default(false).notNull(),
	reactionAcceptance: varchar({ length: 64 }).$type<typeof noteReactionAcceptances[number]>(),
	renoteCount: smallint().default(0).notNull(),
	repliesCount: smallint().default(0).notNull(),
	clippedCount: smallint().default(0).notNull(),
	pageCount: smallint().default(0).notNull(),
	reactions: jsonb().$type<Record<string, number>>().default({}).notNull(),
	visibility: noteVisibilityEnum().notNull().$type<typeof noteVisibilities[number]>(),
	uri: varchar({ length: 512 }),
	url: varchar({ length: 512 }),
	fileIds: varchar({ length: 32 }).array().default(emptyIdArray).notNull().$type<MiDriveFile['id'][]>(),
	attachedFileTypes: varchar({ length: 256 }).array().default(emptyVarcharArray).notNull(),
	visibleUserIds: varchar({ length: 32 }).array().default(emptyIdArray).notNull().$type<MiUser['id'][]>(),
	mentions: varchar({ length: 32 }).array().default(emptyIdArray).notNull().$type<MiUser['id'][]>(),
	mentionedRemoteUsers: text().default('[]').notNull(),
	reactionAndUserPairCache: varchar({ length: 1024 }).array().default(emptyVarcharArray).notNull(),
	emojis: varchar({ length: 128 }).array().default(emptyVarcharArray).notNull(),
	tags: varchar({ length: 128 }).array().default(emptyVarcharArray).notNull(),
	hasPoll: boolean().default(false).notNull(),
	channelId: varchar({ length: 32 }).$type<MiChannel['id'] | null>().references(() => channel.id, { onDelete: 'cascade' }),
	userHost: varchar({ length: 128 }),
	replyUserId: varchar({ length: 32 }).$type<MiUser['id'] | null>(),
	replyUserHost: varchar({ length: 128 }),
	renoteUserId: varchar({ length: 32 }).$type<MiUser['id'] | null>(),
	renoteUserHost: varchar({ length: 128 }),
	renoteChannelId: varchar({ length: 32 }).$type<MiChannel['id'] | null>(),
}, table => [
	index('IDX_17cb3553c700a4985dff5a30ff').on(table.replyId),
	index('IDX_52ccc804d7c69037d558bac4c9').on(table.renoteId),
	index('IDX_d4ebdef929896d6dc4a3c5bb48').on(table.threadId),
	uniqueIndex('IDX_153536c67d05e9adb24e99fc2b').on(table.uri),
	index('IDX_f22169eb10657bded6d875ac8f').on(table.channelId),
	index('IDX_7125a826ab192eb27e11d358a5').on(table.userHost),
	index('IDX_a6f649630f55af3888e5a42919').on(table.userId, table.id),
	// GINインデックスのfastupdateをoffにし、pending listフラッシュによるINSERTのテールレイテンシスパイクを避ける
	index('IDX_NOTE_FILE_IDS').using('gin', table.fileIds).with({ fastupdate: false }),
	index('IDX_NOTE_VISIBLE_USER_IDS').using('gin', table.visibleUserIds).with({ fastupdate: false }),
	index('IDX_NOTE_MENTIONS').using('gin', table.mentions).with({ fastupdate: false }),
	index('IDX_NOTE_TAGS').using('gin', table.tags).with({ fastupdate: false }),
]);

export type NoteRow = typeof note.$inferSelect;
export type NoteInsert = typeof note.$inferInsert;
