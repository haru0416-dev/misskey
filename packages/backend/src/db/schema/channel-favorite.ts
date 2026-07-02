/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiChannel } from '@/models/Channel.js';
import type { MiUser } from '@/models/User.js';

export const channelFavorite = pgTable('channel_favorite', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	channelId: varchar({ length: 32 }).notNull().$type<MiChannel['id']>(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
}, table => [
	index('IDX_d3ca0db011b75ac2a940a2337d').on(table.channelId),
	index('IDX_8302bd27226605ece14842fb25').on(table.userId),
	uniqueIndex('IDX_c71faf11f0a28a5c0bb506203c').on(table.userId, table.channelId),
]);

export type ChannelFavoriteRow = typeof channelFavorite.$inferSelect;
export type ChannelFavoriteInsert = typeof channelFavorite.$inferInsert;
