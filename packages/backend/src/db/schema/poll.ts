/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgEnum, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { noteVisibilities } from '@/types.js';
import type { MiChannel } from '@/models/Channel.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { note } from './note.js';

const emptyVarcharArray = sql`'{}'::character varying[]`;
export const pollNoteVisibilityEnum = pgEnum('poll_notevisibility_enum', noteVisibilities);

export const poll = pgTable(
	'poll',
	{
		noteId: varchar({ length: 32 })
			.primaryKey()
			.notNull()
			.$type<MiNote['id']>()
			.references(() => note.id, { onDelete: 'cascade' }),
		expiresAt: timestamp({ withTimezone: true }),
		multiple: boolean().notNull(),
		choices: varchar({ length: 256 }).array().default(emptyVarcharArray).notNull(),
		votes: integer().array().notNull(),
		noteVisibility: pollNoteVisibilityEnum().notNull().$type<(typeof noteVisibilities)[number]>(),
		userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
		userHost: varchar({ length: 128 }),
		channelId: varchar({ length: 32 }).$type<MiChannel['id'] | null>(),
	},
	(table) => [
		index('IDX_POLL_USER_ID').on(table.userId),
		index('IDX_POLL_USER_HOST').on(table.userHost),
		index('IDX_POLL_CHANNEL_ID').on(table.channelId),
	],
);

export type PollRow = typeof poll.$inferSelect;
export type PollInsert = typeof poll.$inferInsert;
