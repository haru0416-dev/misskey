/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import type { MiAvatarDecoration } from '@/models/AvatarDecoration.js';

const emptyVarcharArray = sql`'{}'::character varying[]`;

export const avatarDecoration = pgTable('avatar_decoration', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	updatedAt: timestamp({ withTimezone: true }),
	url: varchar({ length: 1024 }).notNull(),
	name: varchar({ length: 256 }).notNull(),
	description: varchar({ length: 2048 }).notNull(),
	roleIdsThatCanBeUsedThisDecoration: varchar({ length: 128 }).array().default(emptyVarcharArray).notNull().$type<MiAvatarDecoration['roleIdsThatCanBeUsedThisDecoration']>(),
	category: varchar({ length: 128 }),
});

export type AvatarDecorationRow = typeof avatarDecoration.$inferSelect;
export type AvatarDecorationInsert = typeof avatarDecoration.$inferInsert;
