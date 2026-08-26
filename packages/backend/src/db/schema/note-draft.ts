/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { bigint, boolean, index, pgEnum, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { noteVisibilities, type noteReactionAcceptances } from '@/types.js';
import type { MiChannel } from '@/models/Channel.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';

const emptyVarcharArray = sql`'{}'::character varying[]`;
export const noteDraftVisibilityEnum = pgEnum('note_draft_visibility_enum', noteVisibilities);

export const noteDraft = pgTable(
	'note_draft',
	{
		id: varchar({ length: 32 }).primaryKey().notNull(),
		replyId: varchar({ length: 32 }).$type<MiNote['id'] | null>(),
		renoteId: varchar({ length: 32 }).$type<MiNote['id'] | null>(),
		text: text(),
		cw: varchar({ length: 512 }),
		userId: varchar({ length: 32 })
			.notNull()
			.$type<MiUser['id']>()
			.references(() => user.id, { onDelete: 'cascade' }),
		localOnly: boolean().default(false).notNull(),
		reactionAcceptance: varchar({ length: 64 }).$type<(typeof noteReactionAcceptances)[number]>(),
		visibility: noteDraftVisibilityEnum().notNull().$type<(typeof noteVisibilities)[number]>(),
		fileIds: varchar({ length: 32 }).array().default(emptyVarcharArray).notNull().$type<MiDriveFile['id'][]>(),
		visibleUserIds: varchar({ length: 32 }).array().default(emptyVarcharArray).notNull().$type<MiUser['id'][]>(),
		hashtag: varchar({ length: 128 }),
		channelId: varchar({ length: 32 }).$type<MiChannel['id'] | null>(),
		hasPoll: boolean().default(false).notNull(),
		pollChoices: varchar({ length: 256 }).array().default(emptyVarcharArray).notNull(),
		pollMultiple: boolean().notNull(),
		pollExpiresAt: timestamp({ withTimezone: true }),
		pollExpiredAfter: bigint({ mode: 'number' }),
		scheduledAt: timestamp({ withTimezone: true }),
		isActuallyScheduled: boolean().default(false).notNull(),
	},
	(table) => [
		index('IDX_NOTE_DRAFT_REPLY_ID').on(table.replyId),
		index('IDX_NOTE_DRAFT_RENOTE_ID').on(table.renoteId),
		index('IDX_NOTE_DRAFT_USER_ID').on(table.userId),
		index('IDX_NOTE_DRAFT_CHANNEL_ID').on(table.channelId),
		index('IDX_NOTE_DRAFT_FILE_IDS').using('gin', table.fileIds),
		index('IDX_NOTE_DRAFT_VISIBLE_USER_IDS').using('gin', table.visibleUserIds),
	],
);

export type NoteDraftRow = typeof noteDraft.$inferSelect;
export type NoteDraftInsert = typeof noteDraft.$inferInsert;
