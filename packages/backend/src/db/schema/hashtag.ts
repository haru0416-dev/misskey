/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { integer, pgTable, uniqueIndex, varchar, index } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';

export const hashtag = pgTable('hashtag', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	name: varchar({ length: 128 }).notNull(),
	mentionedUserIds: varchar({ length: 32 }).array().notNull().$type<MiUser['id'][]>(),
	mentionedUsersCount: integer().default(0).notNull(),
	mentionedLocalUserIds: varchar({ length: 32 }).array().notNull().$type<MiUser['id'][]>(),
	mentionedLocalUsersCount: integer().default(0).notNull(),
	mentionedRemoteUserIds: varchar({ length: 32 }).array().notNull().$type<MiUser['id'][]>(),
	mentionedRemoteUsersCount: integer().default(0).notNull(),
	attachedUserIds: varchar({ length: 32 }).array().notNull().$type<MiUser['id'][]>(),
	attachedUsersCount: integer().default(0).notNull(),
	attachedLocalUserIds: varchar({ length: 32 }).array().notNull().$type<MiUser['id'][]>(),
	attachedLocalUsersCount: integer().default(0).notNull(),
	attachedRemoteUserIds: varchar({ length: 32 }).array().notNull().$type<MiUser['id'][]>(),
	attachedRemoteUsersCount: integer().default(0).notNull(),
}, table => [
	uniqueIndex('IDX_347fec870eafea7b26c8a73bac').on(table.name),
	index('IDX_2710a55f826ee236ea1a62698f').on(table.mentionedUsersCount),
	index('IDX_0e206cec573f1edff4a3062923').on(table.mentionedLocalUsersCount),
	index('IDX_4c02d38a976c3ae132228c6fce').on(table.mentionedRemoteUsersCount),
	index('IDX_d57f9030cd3af7f63ffb1c267c').on(table.attachedUsersCount),
	index('IDX_0c44bf4f680964145f2a68a341').on(table.attachedLocalUsersCount),
	index('IDX_0b03cbcd7e6a7ce068efa8ecc2').on(table.attachedRemoteUsersCount),
]);

export type HashtagRow = typeof hashtag.$inferSelect;
export type HashtagInsert = typeof hashtag.$inferInsert;
